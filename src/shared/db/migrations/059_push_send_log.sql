-- ============================================================
-- 059_push_send_log.sql
-- Idempotencia del worker push-send (F3, hallazgo D4 🔴): sin guard,
-- pg-boss (retryLimit=3, PUSH_SEND_SEND_OPTIONS) puede re-entregar un job
-- de push tras un crash/error POST-envío y duplicar el push visible al
-- admin. Mismo idioma que processed_webhooks/lockMpEvent
-- (payment.service.ts:193): claim atómico ANTES de enviar vía
-- INSERT ... ON CONFLICT DO NOTHING RETURNING.
--
-- Diferencia deliberada con processed_webhooks (su gemela semántica): esa
-- tabla nunca tuvo RLS y turnogol_app la escribe directo dentro de
-- withTenantContext (lockMpEvent corre en la tx de la app). push_send_log
-- SOLO la toca el worker (push.worker.ts ya usa getWorkerSql() en esta
-- tabla, BYPASSRLS) — no hay ningún caller de turnogol_app, así que acá se
-- cierra con RLS deny-all + REVOKE explícito (dos capas independientes
-- bloqueando el mismo acceso).
--
-- Claim ANTES de enviar = at-most-once por dedupe_key: un crash entre el
-- claim y el envío pierde ese push (aceptado — molestia menor vs.
-- duplicar el push al admin).
--
-- Sin tenant_id: tabla operacional interna (la dedupeKey ya incluye
-- bookingId + subscriptionId, ver push.service.ts).
-- ============================================================

CREATE TABLE push_send_log (
  dedupe_key text        PRIMARY KEY,
  sent_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE push_send_log IS
  'Idempotencia de push notifications (F3, hallazgo D4). INSERT ... ON '
  'CONFLICT DO NOTHING RETURNING como claim atómico ANTES de enviar — mismo '
  'patrón que processed_webhooks/lockMpEvent. Purga >30 días en '
  'data-retention-cleanup.worker.ts.';

COMMENT ON COLUMN push_send_log.dedupe_key IS
  'Clave determinística por push (push.service.ts), ej. '
  'push:booking-confirmed:<bookingId>:<subscriptionId>.';

-- ─── RLS: deny-all para turnogol_app ────────────────────────────
-- Sin policies (ENABLE+FORCE con cero CREATE POLICY = default-deny para
-- cualquier rol sin BYPASSRLS). Solo turnogol_worker (NOLOGIN BYPASSRLS,
-- migr. 038) ve/escribe esta tabla.
ALTER TABLE push_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_send_log FORCE ROW LEVEL SECURITY;

-- ─── Grants / revokes ────────────────────────────────────────
-- Los DEFAULT PRIVILEGES de 037/038 ya otorgan CRUD a turnogol_app y
-- turnogol_worker sobre tablas nuevas (patrón 048/049): turnogol_worker
-- conserva ese CRUD automático sin necesitar GRANT extra (INSERT del claim
-- + DELETE de la purga >30d). Acá se recorta TODO para turnogol_app
-- (redundante con el RLS de arriba, pero defense-in-depth por catálogo) y
-- para anon/authenticated si existen — guard IF EXISTS, mismo patrón que
-- 056_function_hardening.sql: el container postgres:15 de CI (migraciones
-- aplicadas a mano vía psql, sin el bootstrap de Supabase) no los provisiona.

REVOKE ALL ON push_send_log FROM turnogol_app;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON push_send_log FROM anon;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON push_send_log FROM authenticated;
  END IF;
END $$;
