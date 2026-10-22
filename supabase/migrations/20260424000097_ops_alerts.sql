-- ============================================================
-- 097_ops_alerts.sql
-- Dedupe de las alertas operativas por mail al dueño (cron
-- `whatsapp-ops-alerts`: consumo de Kapso, cola trabada, bot en error).
-- Una fila por clave ya enviada (ej. 'kapso-80:2026-10'): el cron hace
-- INSERT ... ON CONFLICT DO NOTHING RETURNING key y manda el mail solo si
-- insertó. Si el envío falla, borra la clave para que el próximo tick
-- reintente.
--
-- Misma clasificación que push_send_log (059): tabla del sistema, sin
-- tenant_id, SOLO la toca el worker (BYPASSRLS). Para turnogol_app: RLS
-- ENABLE+FORCE sin policies + REVOKE ALL (dos capas independientes).
-- Purga >90 días en data-retention-cleanup.worker.ts.
-- ============================================================

CREATE TABLE ops_alerts (
  key        text        PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ops_alerts IS
  'Dedupe de alertas operativas por mail (cron whatsapp-ops-alerts). INSERT '
  '... ON CONFLICT DO NOTHING RETURNING como claim ANTES de enviar; si el '
  'envío falla se borra la clave. Purga >90 días en '
  'data-retention-cleanup.worker.ts.';

COMMENT ON COLUMN ops_alerts.key IS
  'Clave determinística por alerta, ej. kapso-80:2026-10, '
  'backlog:2026-10-21T14 (fechas y horas en ART).';

-- ─── RLS: deny-all para turnogol_app ────────────────────────────
ALTER TABLE ops_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_alerts FORCE ROW LEVEL SECURITY;

-- ─── Grants / revokes ────────────────────────────────────────
-- Los DEFAULT PRIVILEGES de 037/038 le dan CRUD a turnogol_worker (lo único
-- que necesita). Acá se recorta TODO para turnogol_app y, si existen, para
-- anon/authenticated (guard IF EXISTS: el postgres de CI no los provisiona).
REVOKE ALL ON ops_alerts FROM turnogol_app;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ops_alerts FROM anon;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ops_alerts FROM authenticated;
  END IF;
END $$;
