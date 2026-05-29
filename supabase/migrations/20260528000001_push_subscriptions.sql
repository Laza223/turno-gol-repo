-- ============================================================
-- 014_push_subscriptions.sql
-- Tabla push_subscriptions para Web Push API (Fase F9).
-- Almacena suscripciones push por staff_user por tenant.
--
-- RLS: tenant-scoped (tenant_id = app.current_tenant_id).
-- staff_user_id enforcement deferred to API layer (T4);
-- tenant scoping enforced at DB level via RLS.
-- Service role bypasses RLS (BYPASSRLS) — usado por el worker
-- de limpieza de endpoints 410-gone (F9-T3).
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  staff_user_id  uuid        NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  endpoint       text        NOT NULL UNIQUE,
  p256dh_key     text        NOT NULL,
  auth_key       text        NOT NULL,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_used_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant_staff
  ON push_subscriptions(tenant_id, staff_user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: admin puede ver todas las suscripciones del tenant
-- (útil para "ver receptores push activos" en settings).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'push_subscriptions'
      AND policyname = 'push_subs_select'
  ) THEN
    CREATE POLICY push_subs_select ON push_subscriptions
      FOR SELECT
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Policy: admin puede INSERT/UPDATE/DELETE suscripciones de su tenant.
-- staff_user_id enforcement deferred to API layer via JWT (F9-T4).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'push_subscriptions'
      AND policyname = 'push_subs_modify'
  ) THEN
    CREATE POLICY push_subs_modify ON push_subscriptions
      FOR ALL
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;
