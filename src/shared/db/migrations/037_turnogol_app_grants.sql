-- ============================================================
-- 037_turnogol_app_grants.sql
-- Otorga al rol restringido `turnogol_app` los privilegios CRUD que doc12
-- siempre asumió pero ninguna migración aplicó. El rol se crea NOLOGIN en
-- el bootstrap de CI/deploy (ver docs/planning/deploy-playbook.md §2.1) y
-- 008_revokes.sql le revoca UPDATE/DELETE sobre 2 tablas — pero nunca hubo
-- un GRANT positivo: sin este archivo, turnogol_app no puede leer ni escribir
-- NADA. Esa es la razón real por la que un DATABASE_URL apuntando a
-- turnogol_app fallaba en runtime: no es un problema de RLS, es ausencia
-- total de privilegios a nivel tabla.
--
-- ALTER ROLE turnogol_app WITH LOGIN PASSWORD '...' se hace A MANO fuera de
-- las migraciones (nunca un secret en git) — ver docs/planning/deploy-playbook.md §7.
--
-- Idempotente: GRANT/ALTER DEFAULT PRIVILEGES se pueden re-ejecutar sin efecto.
-- ============================================================

GRANT USAGE ON SCHEMA public TO turnogol_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO turnogol_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO turnogol_app;

-- Cualquier tabla creada por migraciones futuras (corridas por el rol
-- `postgres` vía CI/CLI de Supabase) hereda el mismo GRANT automáticamente,
-- para que la siguiente migración no vuelva a dejar a turnogol_app afuera.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO turnogol_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO turnogol_app;

-- Re-aplica la restricción intencional de 008_revokes.sql: el GRANT ALL
-- TABLES de arriba la pisaría si no se repite acá.
REVOKE UPDATE, DELETE ON audit_logs FROM turnogol_app;
REVOKE UPDATE, DELETE ON daily_cash_closes FROM turnogol_app;
