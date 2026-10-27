# infra — Vapeupar en AWS (CDK)

Infraestructura como código de Vapeupar. Documentación completa, operación diaria,
separación frente a DeliPan y transición a producción en
[`docs/infrastructure-aws.md`](../docs/infrastructure-aws.md).

```
bin/vapeupar.ts        Entrada: etiquetas globales y composición de stacks
lib/config.ts          Configuración por entorno (dev / prod): única fuente de diferencias
lib/network-stack.ts   VPC sin NAT
lib/data-stack.ts      RDS PostgreSQL privada + bastión SSM
lib/storage-stack.ts   S3 privado + CloudFront (OAC)
lib/auth-stack.ts      Cognito para la consola /admin
lib/ops-stack.ts       Presupuesto y grupo de recursos
scripts/               Túnel a la base y generación de backend/.env
```

Uso habitual, desde la raíz del repositorio:

```bash
npm run infra:diff          # siempre antes de desplegar
npm run infra:deploy
npm run infra:db-tunnel     # localhost:15432 -> RDS dev
npm run infra:env-backend   # escribe backend/.env desde SSM y Secrets Manager
```

Los comandos de CDK necesitan el correo de alertas de presupuesto en
`~/.cdk.json` (`{"context": {"alertEmail": "..."}}`) o en `VAPEUPAR_ALERT_EMAIL`.
