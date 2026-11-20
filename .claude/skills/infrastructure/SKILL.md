---
name: infrastructure
description: Entorno de desarrollo local, scripts de ejecución y despliegue de Vapeupar. Usar para cambios en package.json raíz, scripts npm o variables de entorno.
---

# Infrastructure - Vapeupar

## Propósito
Gestionar el entorno de desarrollo local y el despliegue de Vapeupar en AWS: todo por CDK en `infra/` (cuenta compartida con DeliPan, `us-east-1`). El entorno `dev` es la producción desde el 2026-11-06 (https://vapeupar.ddns.net); `prod` solo existe en `infra/lib/config.ts`.

Arquitectura desplegada: una EC2 `t4g.micro` con nginx (TLS de Let's Encrypt, límites de tasa) delante del frontend Next (`:3000`) y del backend Express (`:4000`), ambos con systemd; RDS PostgreSQL privada; S3 + CloudFront para imágenes; Cognito para la consola. Las releases se empaquetan, se suben a S3 y se activan por SSM (`infra/deploy/activate.sh`, que también aplica migraciones), a mano con `npm run app:deploy` o desde GitHub Actions con OIDC.

## Cuándo usarla
- Al ajustar scripts del `package.json` raíz o de los workspaces (`frontend/`, `backend/`, `infra/`).
- Al configurar nuevas variables de entorno o actualizar `.env.example` (en producción salen de SSM y Secrets Manager).
- Al tocar stacks de CDK (`infra/lib/`), lo que se instala en la EC2 (`infra/deploy/`) o los workflows de `.github/workflows/`.

## Debe consultar
- `docs/infrastructure-aws.md` (runbook: despliegue, migraciones, vuelta atrás, alarmas, costos)
- `docs/aws-full-deployment-plan.md` (fases F1–F7)
- `infra/README.md`
- `docs/architecture.md`
- `docs/security.md`

## Comandos (desde la raíz)
- `npm run infra:diff` antes de cada `npm run infra:deploy`.
- `npm run infra:db-tunnel` (túnel a RDS por la EC2) e `npm run infra:env-backend` (escribe `backend/.env`).
- `npm run app:deploy` y `npm run app:rollback` para la aplicación.

## Reglas
- Mantener la facilidad de ejecución local con un único comando o comandos claros por workspace.
- Nunca commitear archivos `.env` reales con credenciales.
- Documentar cualquier nuevo requisito de runtime (versión mínima de Node.js, puertos, etc.). La instancia y CI usan Node 22.
- Ningún recurso se crea a mano en la consola de AWS ni se toca nada de DeliPan.
- Detener la EC2 o la RDS tumba la tienda en producción: no es una forma de ahorrar.
- Instalar dependencias solo desde la raíz del monorepo (workspaces).
