-- Rol de la aplicación (ADR-002; plan A1.1).
--
-- El backend conecta en runtime como `vapeupar_app`, nunca con el usuario
-- maestro. Este rol no tiene DDL y sus permisos refuerzan en la base las reglas
-- del modelo:
--   * Nada se borra físicamente: sin DELETE salvo en la tabla de unión
--     marca-proveedor.
--   * El libro de inventario y la auditoría son de solo inserción.
--   * Del contenido versionado solo se puede marcar la publicación.
--
-- El rol se crea sin LOGIN. La contraseña (Secrets Manager
-- `vapeupar/<env>/rds-app`) la aplica `npm run db:sync-app-role`, porque una
-- migración no debe contener secretos.
--
-- Toda migración futura que cree una tabla debe conceder aquí sus permisos de
-- forma explícita: no se usan privilegios por defecto.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vapeupar_app') THEN
    CREATE ROLE vapeupar_app NOLOGIN;
  END IF;
  -- La base de datos se nombra con current_database() porque Prisma también
  -- aplica las migraciones a una base sombra con otro nombre.
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO vapeupar_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO vapeupar_app;

GRANT SELECT, INSERT, UPDATE ON suppliers, brands, products, variants, users TO vapeupar_app;
GRANT SELECT, INSERT, DELETE ON brand_suppliers TO vapeupar_app;
GRANT SELECT, INSERT ON stock_movements, audit_logs TO vapeupar_app;
GRANT SELECT, INSERT ON site_content TO vapeupar_app;
GRANT UPDATE (published_at) ON site_content TO vapeupar_app;
