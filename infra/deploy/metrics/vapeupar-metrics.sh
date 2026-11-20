#!/bin/bash
# Métricas propias de la instancia a CloudWatch (namespace Vapeupar), sin
# agente residente: la máquina tiene 1 GB de RAM. Lo lanza cada 5 minutos
# `vapeupar-metrics.timer`. docs/aws-full-deployment-plan.md F6.
#
#   MemUsedPercent       (MemTotal - MemAvailable) / MemTotal
#   RootDiskUsedPercent  ocupación de /
#   CertDaysLeft         días hasta que caduca el certificado de Let's Encrypt
#
# SOLO LAS QUE TIENEN ALARMA: la capa gratuita da 10 métricas propias por
# cuenta, compartidas con DeliPan (MAX_CUSTOM_METRICS en monitoring-stack.ts,
# comprobado por infra/test/monitoring.test.ts, que cuenta las llamadas a
# `datum` de este archivo). Añadir una métrica es subir ese techo a sabiendas.
#
# Dimensión `Environment=<entorno>` y NO el id de la instancia: así las
# alarmas siguen valiendo si la EC2 se reemplaza. Si este script deja de
# enviar, las alarmas de memoria, disco y certificado saltan solas
# (treatMissingData BREACHING en monitoring-stack.ts): no hay alarma aparte
# para el timer.
#
# CADA MÉTRICA ES INDEPENDIENTE: si una no se puede calcular (certificado
# corrupto, openssl ausente...), se omite con un aviso y las demás se envían.
# La que falta la detecta su alarma por falta de datos.
#
# Necesita `openssl` (paquete openssl de AL2023); activate.sh lo instala si
# falta. Solo envía métricas: los registros se quedan en journald.
#
# Prueba en local sin AWS: VAPEUPAR_METRICS_DRY_RUN=1 bash vapeupar-metrics.sh
set -euo pipefail

ENV_FILE=/etc/vapeupar/instance.env
# shellcheck disable=SC1090
[ -r "$ENV_FILE" ] && . "$ENV_FILE"
ENV_NAME="${VAPEUPAR_ENV:-dev}"
REGION="${AWS_REGION:-us-east-1}"
CERT="${VAPEUPAR_CERT:-/etc/letsencrypt/live/vapeupar/fullchain.pem}"
NAMESPACE=Vapeupar

warn() { echo "AVISO: $*" >&2; }
is_num() { [[ "${1:-}" =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; }

# --- Memoria ------------------------------------------------------------------
MEM="$(awk '
  /^MemTotal:/     { mt = $2 }
  /^MemAvailable:/ { ma = $2; has = 1 }
  /^MemFree:/      { mf = $2 }
  /^Buffers:/      { bu = $2 }
  /^Cached:/       { ca = $2 }
  END {
    if (!has) ma = mf + bu + ca   # kernels sin MemAvailable
    if (mt > 0) printf "%.1f\n", (mt - ma) * 100 / mt
  }' /proc/meminfo 2>/dev/null)" || MEM=""

# --- Disco raíz ---------------------------------------------------------------
DISK="$(df -P / 2>/dev/null | awk 'NR == 2 { v = $(NF - 1); sub(/%/, "", v); print v }')" || DISK=""

# --- Certificado (best-effort) ------------------------------------------------
# Sin certificado (instancia aún sin TLS), corrupto o sin openssl no se envía:
# la alarma lo ve como datos que faltan y avisa, que es lo correcto.
CERT_DAYS=""
if [ -r "$CERT" ]; then
  END_DATE="$(openssl x509 -enddate -noout -in "$CERT" 2>/dev/null | cut -d= -f2)" || END_DATE=""
  END_TS=""
  [ -n "$END_DATE" ] && { END_TS="$(date -d "$END_DATE" +%s 2>/dev/null)" || END_TS=""; }
  if is_num "$END_TS"; then
    CERT_DAYS="$(awk -v e="$END_TS" -v n="$(date +%s)" 'BEGIN { printf "%.1f", (e - n) / 86400 }')"
  else
    warn "no se pudo leer la fecha de caducidad de $CERT"
  fi
else
  warn "sin certificado en $CERT"
fi

datum() { # nombre valor unidad
  printf '{"MetricName":"%s","Value":%s,"Unit":"%s","Dimensions":[{"Name":"Environment","Value":"%s"}]}' \
    "$1" "$2" "$3" "$ENV_NAME"
}

ITEMS=()
if is_num "$MEM"; then ITEMS+=("$(datum MemUsedPercent "$MEM" Percent)"); else warn "memoria no disponible"; fi
if is_num "$DISK"; then ITEMS+=("$(datum RootDiskUsedPercent "$DISK" Percent)"); else warn "disco no disponible"; fi
if is_num "$CERT_DAYS"; then ITEMS+=("$(datum CertDaysLeft "$CERT_DAYS" None)"); fi

if [ "${#ITEMS[@]}" -eq 0 ]; then
  warn "ninguna métrica que enviar"
  exit 1
fi
DATA="[$(IFS=,; echo "${ITEMS[*]}")]"

if [ "${VAPEUPAR_METRICS_DRY_RUN:-}" = "1" ]; then
  echo "$DATA"
  exit 0
fi

aws cloudwatch put-metric-data --region "$REGION" --namespace "$NAMESPACE" --metric-data "$DATA"
echo "mem=${MEM:-?}% disco=${DISK:-?}% cert=${CERT_DAYS:-?}d"
