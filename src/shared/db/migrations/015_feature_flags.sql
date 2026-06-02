-- ============================================================
-- 015_feature_flags.sql
-- Tabla feature_flags: toggles operativos sin redeploy (Fase 6).
--
--   tenant_id NULL    = flag GLOBAL (default del sistema).
--   tenant_id seteado = override POR TENANT (ej: kill switch `suspended`).
--
-- Unicidad: un único row global por key + un único row por (key, tenant).
-- Postgres no considera dos NULL como iguales, así que se usan DOS índices
-- únicos parciales en lugar de un `UNIQUE(key)` plano — un UNIQUE(key) simple
-- impediría tener `online_booking` global Y un override por tenant a la vez,
-- rompiendo el modelo global+override (y el kill switch, que necesita una fila
-- `suspended` por tenant).
--
-- RLS: SELECT permitido para rows globales (tenant_id IS NULL) y para los del
-- tenant en contexto (app.current_tenant_id). Sin policy de escritura: los flags
-- los mutan las migraciones/seed y roles elevados (service_role / super-admin con
-- BYPASSRLS); los roles de app quedan read-only.
-- ============================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL,
  value       boolean     NOT NULL DEFAULT false,
  tenant_id   uuid        REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Un solo row GLOBAL por key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_feature_flags_global
  ON feature_flags(key)
  WHERE tenant_id IS NULL;

-- Un solo row por (key, tenant) para los overrides.
CREATE UNIQUE INDEX IF NOT EXISTS uq_feature_flags_tenant
  ON feature_flags(key, tenant_id)
  WHERE tenant_id IS NOT NULL;

-- Lookup por key (+ tenant) usado por isFeatureEnabled().
CREATE INDEX IF NOT EXISTS idx_feature_flags_key
  ON feature_flags(key);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'feature_flags' AND policyname = 'feature_flags_select'
  ) THEN
    CREATE POLICY feature_flags_select ON feature_flags
      FOR SELECT
      USING (
        tenant_id IS NULL
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      );
  END IF;
END $$;

-- Seeds globales (idempotente vía el índice único parcial global).
INSERT INTO feature_flags (key, value, tenant_id) VALUES
  ('online_booking', true, NULL),
  ('mp_payments',    true, NULL)
ON CONFLICT (key) WHERE tenant_id IS NULL DO NOTHING;
