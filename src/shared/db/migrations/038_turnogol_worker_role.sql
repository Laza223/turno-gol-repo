-- ============================================================
-- 038_turnogol_worker_role.sql
-- Rol dedicado para los workers de pg-boss (Railway), en vez de reusar el
-- superuser `postgres` de Supabase como WORKER_DATABASE_URL.
--
-- `turnogol_app` (037) queda restringido a propósito: sin BYPASSRLS, no ve
-- filas cross-tenant. Los workers SÍ necesitan ver todas las filas (dunning,
-- expiry, retention, reconciliación — client.ts:94-105, doc BK-01), pero no
-- necesitan superuser: BYPASSRLS alcanza para saltar RLS, no hace falta
-- CREATEDB/CREATEROLE/REPLICATION ni ser owner del schema `public`.
--
-- LOGIN + PASSWORD se setean A MANO fuera de las migraciones (nunca un
-- secret en git) — ver docs/planning/deploy-playbook.md §7.
--
-- pg-boss crea/migra su propio schema `pgboss` recién en el primer
-- `jobs:start()` (boss.ts:19) — NO existe todavía en un ambiente fresco al
-- momento de aplicar esta migración. Por eso:
--   * se le da CREATE sobre la base al rol, para que pg-boss se
--     auto-aprovisione ahí sin depender de un rol superuser;
--   * el GRANT explícito sobre el schema `pgboss` (necesario en ambientes
--     donde el schema ya existe, creado antes por `postgres`) va guardado
--     con un chequeo de existencia — si no existe todavía, se saltea sin
--     error y pg-boss lo crea (ya con turnogol_worker como owner, con
--     privilegios completos, sin necesitar GRANT extra).
--
-- Idempotente: CREATE ROLE guardado con IF NOT EXISTS; GRANT/ALTER DEFAULT
-- PRIVILEGES se pueden re-ejecutar sin efecto; el bloque de `pgboss` es
-- no-op si el schema no existe.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_worker') THEN
    CREATE ROLE turnogol_worker NOLOGIN BYPASSRLS;
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE format('GRANT CREATE ON DATABASE %I TO turnogol_worker', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO turnogol_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO turnogol_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO turnogol_worker;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO turnogol_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO turnogol_worker;

-- Solo aplica si `pgboss` ya existe (deploy sobre un ambiente donde los
-- workers ya corrieron alguna vez bajo `postgres`). En un ambiente fresco
-- este bloque es no-op — pg-boss crea el schema él mismo en su primer boot.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pgboss') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA pgboss TO turnogol_worker';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO turnogol_worker';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO turnogol_worker';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO turnogol_worker';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT USAGE, SELECT ON SEQUENCES TO turnogol_worker';
  END IF;
END $$;

-- Misma restricción que 008_revokes.sql aplica a turnogol_app: los workers
-- tampoco corrigen audit_logs/daily_cash_closes directamente.
REVOKE UPDATE, DELETE ON audit_logs FROM turnogol_worker;
REVOKE UPDATE, DELETE ON daily_cash_closes FROM turnogol_worker;
