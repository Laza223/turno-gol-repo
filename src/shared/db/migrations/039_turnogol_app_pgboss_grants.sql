-- ============================================================
-- 039_turnogol_app_pgboss_grants.sql
-- `turnogol_app` (DATABASE_URL) es el rol que boss.ts:27 usa para pg-boss
-- en sí — en el proceso web Y en el worker (`pnpm jobs:start`), porque
-- getBoss() lee process.env.DATABASE_URL, no WORKER_DATABASE_URL. 037 solo
-- otorgó acceso al schema `public`; las tablas propias de pg-boss viven en
-- `pgboss` (comentario de boss.ts: "pg-boss creates/migrates it on
-- start()") y nunca se le dieron grants ahí.
--
-- Confirmado con repro directa: `permission denied for schema pgboss` al
-- llamar getBoss() como turnogol_app una vez que el schema ya existe
-- (creado antes por `postgres`) — GET /api/status devuelve pg-boss: down.
--
-- 038 le dio a `turnogol_worker` CREATE-on-database + acceso a `pgboss` bajo
-- el supuesto (incorrecto) de que pg-boss conectaba con el rol worker. Ese
-- grant queda sin uso pero inofensivo — no se edita una migración existente.
--
-- pg-boss corre su propia migración interna (crea/altera sus tablas) en
-- `.start()` — por eso turnogol_app necesita CREATE sobre el schema en sí,
-- no solo CRUD sobre las tablas ya creadas. Es CREATE a nivel de ESE schema
-- puntual (no de la base entera, a diferencia de 038), así el rol del web
-- app no gana privilegio para crear schemas nuevos en cualquier lado.
--
-- Idempotente: CREATE SCHEMA IF NOT EXISTS; GRANT/ALTER DEFAULT PRIVILEGES
-- se pueden re-ejecutar sin efecto.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS pgboss;

GRANT USAGE, CREATE ON SCHEMA pgboss TO turnogol_app;

-- Si las tablas de pg-boss ya existen (ambientes donde ya corrió bajo
-- `postgres` u otro rol), dar CRUD directo. En un ambiente fresco este
-- bloque es no-op — pg-boss crea sus tablas él mismo en el primer start(),
-- ya como owner turnogol_app, sin necesitar GRANT extra.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'pgboss') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO turnogol_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO turnogol_app';
  END IF;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO turnogol_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss
  GRANT USAGE, SELECT ON SEQUENCES TO turnogol_app;
