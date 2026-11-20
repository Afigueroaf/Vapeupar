#!/bin/bash
# Activa una release de Vapeupar EN LA INSTANCIA. Lo lanza
# `infra/scripts/deploy-app.mjs` por SSM (Run Command), como root.
# docs/aws-full-deployment-plan.md F3.
#
#   activate.sh <bucket> <clave> <versionId> <releaseId> <entorno> <región>
#
# Pasos: descargar la versión EXACTA del objeto (no "la última": si alguien
# sube otra mientras tanto, se activa la que se pidió), desempaquetar en una
# carpeta nueva, APLICAR LAS MIGRACIONES pendientes (deploy/migrate.mjs),
# instalar unidades y nginx, mover `current`, reiniciar y VERIFICAR. Si la
# verificación falla, vuelve a la release anterior (las migraciones no se
# deshacen: deben ser compatibles con el código anterior). Si pasa, instala la
# vigilancia de la instancia (F6: límites de journald, rotación de nginx y
# vapeupar-metrics.timer).
#
# VOLVER ATRÁS a una release que sigue en la instancia: `<versionId>` = `-`.
# No descarga nada NI MIGRA: reactiva `releases/<releaseId>` tal cual. Lo usa
# `infra/scripts/rollback-app.mjs`.
set -euo pipefail

BUCKET="$1"; KEY="$2"; VERSION="$3"; RELEASE="$4"; ENV_NAME="$5"; REGION="$6"

BASE=/opt/vapeupar
DEST="$BASE/releases/$RELEASE"
CUR="$BASE/current"
KEEP=3   # releases que se conservan para volver atrás a mano

log() { echo "[activate $(date +%T)] $*"; }
# Certificado de Let's Encrypt con nombre fijo (`certbot --cert-name vapeupar`).
TLS_CERT=/etc/letsencrypt/live/vapeupar/fullchain.pem

# Unidades de systemd de una release: *.service y, desde F6, *.timer. Releases
# anteriores no traen timers: el patrón sin coincidencias no se instala. Una
# unidad que ya está en /etc/systemd/system y que la release no trae (p. ej. al
# volver atrás a una anterior a F6) se queda donde está.
install_units() {
  local f
  for f in "$1"/deploy/systemd/*.service "$1"/deploy/systemd/*.timer; do
    [ -f "$f" ] && install -m 644 "$f" /etc/systemd/system/
  done
  return 0
}

[[ "$RELEASE" =~ ^[A-Za-z0-9._-]+$ ]] || { log "id de release inválido"; exit 2; }

PREV=""
[ -L "$CUR" ] && PREV="$(readlink -f "$CUR")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ "$VERSION" = "-" ]; then
  # --- 1'. Volver atrás: la release ya está en la instancia ----------------
  [ -d "$DEST" ] || { log "no existe $DEST; disponibles:"; ls -1t "$BASE/releases"; exit 2; }
  [ "$(readlink -f "$DEST")" != "$PREV" ] || { log "$RELEASE ya es la release activa"; exit 0; }
  log "volviendo atrás a $RELEASE, sin migraciones"
else
# --- 1. Descargar y desempaquetar -------------------------------------------
log "descargando s3://$BUCKET/$KEY ($VERSION)"
aws s3api get-object --region "$REGION" --bucket "$BUCKET" --key "$KEY" \
  --version-id "$VERSION" "$TMP/app.tar.gz" >/dev/null

rm -rf "$DEST.partial"
mkdir -p "$DEST.partial"
tar -xzf "$TMP/app.tar.gz" -C "$DEST.partial" --no-same-owner
# Todo de root y de solo lectura para el servicio, SALVO `.next` del
# frontend: ahí Next guarda las páginas regeneradas (ISR) y las imágenes
# optimizadas. Es lo único que el usuario `vapeupar` puede escribir.
chown -R root:root "$DEST.partial"
chmod -R go-w "$DEST.partial"
chown -R vapeupar:vapeupar "$DEST.partial/web/frontend/.next"
rm -rf "$DEST"
mv "$DEST.partial" "$DEST"
log "release en $DEST ($(du -sh "$DEST" | cut -f1))"

# --- 1b. Migraciones ---------------------------------------------------------
# ANTES de cambiar `current`: si fallan, la release anterior sigue sirviendo y
# no se toca nada más. La carpeta se borra para que no ocupe el sitio de una
# release buena entre las $KEEP que se conservan. Releases antiguas sin
# migrate.mjs: se omite.
if [ -f "$DEST/deploy/migrate.mjs" ]; then
  /usr/local/bin/node "$DEST/deploy/migrate.mjs" "$DEST" "$ENV_NAME" "$REGION" || {
    log "FALLO en las migraciones: no se activa nada; sigue ${PREV:-ninguna}"
    rm -rf "$DEST"
    exit 1
  }
fi
fi

# --- 2. Entorno de la instancia ----------------------------------------------
install -d -m 700 /etc/vapeupar
printf 'VAPEUPAR_ENV=%s\nAWS_REGION=%s\n' "$ENV_NAME" "$REGION" > /etc/vapeupar/instance.env
chmod 600 /etc/vapeupar/instance.env

# --- 3. systemd y nginx (con copia para volver atrás) ------------------------
BAK="$TMP/bak"; mkdir -p "$BAK"
cp -a /etc/nginx/nginx.conf "$BAK/" 2>/dev/null || true
cp -a /etc/nginx/conf.d/vapeupar.conf "$BAK/" 2>/dev/null || true
cp -a /etc/nginx/vapeupar/site.inc "$BAK/" 2>/dev/null || true

install_units "$DEST"
install -m 644 "$DEST/deploy/nginx/nginx.conf" /etc/nginx/nginx.conf
# Sitio: rutas comunes en site.inc y una de las dos variantes según haya o no
# certificado (F4). certbot solo OBTIENE el certificado (`certonly`), no edita
# nginx, así que el sitio se puede reinstalar en cada despliegue sin perder el
# TLS. Releases anteriores a este esquema no traen site.inc: se instala su
# vapeupar.conf de una pieza, como antes.
install -d -m 755 /etc/nginx/vapeupar
if [ -f "$DEST/deploy/nginx/vapeupar-site.inc" ]; then
  install -m 644 "$DEST/deploy/nginx/vapeupar-site.inc" /etc/nginx/vapeupar/site.inc
fi
if [ -f "$TLS_CERT" ] && [ -f "$DEST/deploy/nginx/vapeupar-tls.conf" ]; then
  log "certificado presente: sitio con TLS"
  install -m 644 "$DEST/deploy/nginx/vapeupar-tls.conf" /etc/nginx/conf.d/vapeupar.conf
else
  install -m 644 "$DEST/deploy/nginx/vapeupar.conf" /etc/nginx/conf.d/vapeupar.conf
fi
nginx -t

# --- 4. Cambiar `current` (atómico) y reiniciar ------------------------------
switch_to() {
  ln -sfn "$1" "$CUR.new"
  mv -T "$CUR.new" "$CUR"
  systemctl daemon-reload
  systemctl enable --quiet vapeupar-env vapeupar-backend vapeupar-frontend
  systemctl restart vapeupar-env
  systemctl restart vapeupar-backend
  systemctl restart vapeupar-frontend
  systemctl reload nginx
}

# --- 5. Verificación ---------------------------------------------------------
# Backend directo por loopback y la portada A TRAVÉS de nginx (que es lo que
# ve el público): si nginx no reparte bien, el despliegue no está bien.
#
# Con TLS se verifica por https: el puerto 80 solo redirige, y un 301 haría
# pasar la comprobación sin haber probado nada. `-k` porque el certificado es
# del nombre público, no de 127.0.0.1; aquí se comprueba el reparto, no el
# certificado.
verify() {
  local i web="http://127.0.0.1" tls=()
  # Solo directivas: el vapeupar.conf antiguo menciona «listen 443» en un comentario.
  if grep -qE '^[[:space:]]*listen[[:space:]]+443' /etc/nginx/conf.d/vapeupar.conf 2>/dev/null; then
    web="https://127.0.0.1"; tls=(-k)
  fi
  for i in $(seq 1 45); do
    if curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:4000/health \
       && curl -fsS "${tls[@]}" -o /dev/null --max-time 15 "$web/" \
       && curl -fsS "${tls[@]}" -o /dev/null --max-time 5 "$web/api/products?limit=1"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

log "activando $RELEASE (anterior: ${PREV:-ninguna})"
switch_to "$DEST"

if verify; then
  log "OK: backend /health, portada y /api/products responden"
else
  log "FALLO de verificación. Últimas líneas de los servicios:"
  journalctl -u vapeupar-env -u vapeupar-backend -u vapeupar-frontend -n 40 --no-pager || true
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    log "volviendo a $PREV"
    cp -a "$BAK/nginx.conf" /etc/nginx/nginx.conf 2>/dev/null || true
    cp -a "$BAK/vapeupar.conf" /etc/nginx/conf.d/vapeupar.conf 2>/dev/null || true
    cp -a "$BAK/site.inc" /etc/nginx/vapeupar/site.inc 2>/dev/null || true
    install_units "$PREV"
    switch_to "$PREV"
    verify && log "release anterior restaurada y respondiendo" || log "la anterior TAMPOCO responde"
  fi
  exit 1
fi

# --- 5b. Vigilancia de la instancia (F6) ------------------------------------
# Después de verificar: un despliegue fallido no toca nada de esto. Todo es
# idempotente y nada impide el despliegue: llamada con `||`, bash no aplica
# `set -e` dentro, así que un paso que falle deja su error en la salida del
# despliegue y se sigue con el siguiente (las alarmas de memoria, disco y
# certificado detectan por falta de datos que las métricas no llegan).
# Releases anteriores a F6 no traen estos archivos: se deja lo que haya.
monitoring() {
  # journald con límite de tamaño y antigüedad. Solo se reinicia si cambia.
  local jconf="$DEST/deploy/journald/90-vapeupar.conf"
  if [ -f "$jconf" ]; then
    install -d -m 755 /etc/systemd/journald.conf.d
    if ! cmp -s "$jconf" /etc/systemd/journald.conf.d/90-vapeupar.conf; then
      install -m 644 "$jconf" /etc/systemd/journald.conf.d/90-vapeupar.conf
      systemctl restart systemd-journald
      log "journald: límites actualizados"
    fi
  fi

  # Rotación de nginx: solo si el paquete no trae la suya.
  if [ ! -f /etc/logrotate.d/nginx ] && [ -f "$DEST/deploy/nginx/logrotate" ]; then
    install -m 644 "$DEST/deploy/nginx/logrotate" /etc/logrotate.d/nginx
    log "logrotate: instalada la rotación de nginx"
  fi
  command -v logrotate >/dev/null || log "AVISO: logrotate no está instalado"

  # Métricas propias cada 5 minutos (vapeupar-metrics.timer). El script usa
  # openssl para la caducidad del certificado; la AMI estándar de AL2023 lo
  # suele traer, pero el user-data no lo instala: se garantiza aquí.
  if [ -f "$DEST/deploy/metrics/vapeupar-metrics.sh" ] && [ -f /etc/systemd/system/vapeupar-metrics.timer ]; then
    command -v openssl >/dev/null || dnf install -y -q openssl || log "AVISO: no se pudo instalar openssl (sin CertDaysLeft)"
    install -m 755 "$DEST/deploy/metrics/vapeupar-metrics.sh" /usr/local/sbin/vapeupar-metrics
    systemctl daemon-reload
    systemctl enable --quiet vapeupar-metrics.timer
    # restart y no solo --now: recoge un cambio de horario del timer.
    systemctl restart vapeupar-metrics.timer
    log "métricas: vapeupar-metrics.timer activo"
  fi
}
monitoring || log "AVISO: revisa arriba los errores de la vigilancia de la instancia"

# --- 6. Limpieza: conservar las $KEEP releases más recientes -----------------
ACTIVE="$(readlink -f "$CUR")"
ls -1dt "$BASE"/releases/*/ 2>/dev/null | sed 's#/$##' | tail -n +$((KEEP + 1)) | while read -r d; do
  [ "$d" = "$ACTIVE" ] || { rm -rf "$d"; log "borrada release antigua $(basename "$d")"; }
done
log "listo"
