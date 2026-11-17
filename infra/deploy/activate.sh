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
# deshacen: deben ser compatibles con el código anterior).
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

install -m 644 "$DEST"/deploy/systemd/*.service /etc/systemd/system/
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
  if grep -q 'listen 443' /etc/nginx/conf.d/vapeupar.conf 2>/dev/null; then
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
    install -m 644 "$PREV"/deploy/systemd/*.service /etc/systemd/system/
    switch_to "$PREV"
    verify && log "release anterior restaurada y respondiendo" || log "la anterior TAMPOCO responde"
  fi
  exit 1
fi

# --- 6. Limpieza: conservar las $KEEP releases más recientes -----------------
ACTIVE="$(readlink -f "$CUR")"
ls -1dt "$BASE"/releases/*/ 2>/dev/null | sed 's#/$##' | tail -n +$((KEEP + 1)) | while read -r d; do
  [ "$d" = "$ACTIVE" ] || { rm -rf "$d"; log "borrada release antigua $(basename "$d")"; }
done
log "listo"
