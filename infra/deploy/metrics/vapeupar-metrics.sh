#!/bin/bash
# Métricas propias de la instancia a CloudWatch (namespace Vapeupar), sin
# agente residente: la máquina tiene 1 GB de RAM. Lo lanza cada 5 minutos
# `vapeupar-metrics.timer`. docs/aws-full-deployment-plan.md F6.
#
#   MemUsedPercent       (MemTotal - MemAvailable) / MemTotal
#   SwapUsedPercent      swap en uso (sin alarma: solo para mirar)
#   RootDiskUsedPercent  ocupación de /
#   CertDaysLeft         días hasta que caduca el certificado de Let's Encrypt
#
# Dimensión `Environment=<entorno>` y NO el id de la instancia: así las
# alarmas siguen valiendo si la EC2 se reemplaza. Si este script deja de
# enviar, las alarmas de memoria, disco y certificado saltan solas
# (treatMissingData BREACHING en monitoring-stack.ts): no hay alarma aparte
# para el timer.
#
# Solo envía métricas: los registros se quedan en journald, en la instancia.
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

# --- Memoria y swap -----------------------------------------------------------
read -r MEM SWAP < <(awk '
  /^MemTotal:/     { mt = $2 }
  /^MemAvailable:/ { ma = $2; has = 1 }
  /^MemFree:/      { mf = $2 }
  /^Buffers:/      { bu = $2 }
  /^Cached:/       { ca = $2 }
  /^SwapTotal:/    { st = $2 }
  /^SwapFree:/     { sf = $2 }
  END {
    if (!has) ma = mf + bu + ca   # kernels sin MemAvailable
    mem  = (mt > 0) ? (mt - ma) * 100 / mt : 0
    swap = (st > 0) ? (st - sf) * 100 / st : 0
    printf "%.1f %.1f\n", mem, swap
  }' /proc/meminfo)

# --- Disco raíz ---------------------------------------------------------------
DISK="$(df -P / | awk 'NR == 2 { v = $(NF - 1); sub(/%/, "", v); print v }')"

# --- Certificado --------------------------------------------------------------
# Sin certificado (instancia aún sin TLS) no se envía: la alarma lo ve como
# datos que faltan y avisa, que es lo correcto en producción.
CERT_DAYS=""
if [ -r "$CERT" ]; then
  END_DATE="$(openssl x509 -enddate -noout -in "$CERT" | cut -d= -f2)"
  END_TS="$(date -d "$END_DATE" +%s)"
  CERT_DAYS="$(awk -v e="$END_TS" -v n="$(date +%s)" 'BEGIN { printf "%.1f", (e - n) / 86400 }')"
fi

datum() { # nombre valor unidad
  printf '{"MetricName":"%s","Value":%s,"Unit":"%s","Dimensions":[{"Name":"Environment","Value":"%s"}]}' \
    "$1" "$2" "$3" "$ENV_NAME"
}

DATA="[$(datum MemUsedPercent "$MEM" Percent),$(datum SwapUsedPercent "$SWAP" Percent),$(datum RootDiskUsedPercent "$DISK" Percent)"
[ -n "$CERT_DAYS" ] && DATA="$DATA,$(datum CertDaysLeft "$CERT_DAYS" None)"
DATA="$DATA]"

if [ "${VAPEUPAR_METRICS_DRY_RUN:-}" = "1" ]; then
  echo "$DATA"
  exit 0
fi

aws cloudwatch put-metric-data --region "$REGION" --namespace "$NAMESPACE" --metric-data "$DATA"
echo "mem=${MEM}% swap=${SWAP}% disco=${DISK}% cert=${CERT_DAYS:-sin certificado}d"
