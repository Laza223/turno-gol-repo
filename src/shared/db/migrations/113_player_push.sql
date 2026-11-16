-- Push del jugador: suscripciones por dispositivo y dedupe de recordatorios.
-- Decisión 2026-11-16 (docs/decisions/2026-11-16-push-urgente-permiso-y-recordatorio-jugador.md):
-- se levanta el veto del recordatorio al jugador; recibe un push 24 h y otro 2 h antes del turno.

-- Suscripciones del jugador. Sin tenant_id: el jugador es cross-tenant y el aviso
-- de cualquier complejo le llega al mismo dispositivo. Cada jugador administra
-- las suyas (app.current_player_id); el staff no las ve. El worker las lee con el
-- pool BYPASSRLS.
CREATE TABLE player_push_subscriptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    uuid        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  endpoint     text        NOT NULL UNIQUE,
  p256dh_key   text        NOT NULL,
  auth_key     text        NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX idx_player_push_subscriptions_player ON player_push_subscriptions(player_id);

ALTER TABLE player_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_push_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY player_push_subscriptions_own ON player_push_subscriptions FOR ALL TO turnogol_app
  USING (player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid))
  WITH CHECK (player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON player_push_subscriptions TO turnogol_app, turnogol_worker;
REVOKE ALL ON player_push_subscriptions FROM PUBLIC;

-- Dedupe de recordatorios: una fila por turno, tipo (24h / 2h) e inicio. El
-- inicio va en la clave porque reprogramar mueve la misma fila de bookings: el
-- horario nuevo vuelve a tener sus dos avisos. Del sistema,
-- como push_send_log y rival_alert_sends: RLS + FORCE sin policies y cero
-- permisos para la app; la escribe solo el worker.
CREATE TABLE player_reminder_sends (
  booking_id uuid        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind       text        NOT NULL CHECK (kind IN ('24h', '2h')),
  starts_at  timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, kind, starts_at)
);
ALTER TABLE player_reminder_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_reminder_sends FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON player_reminder_sends TO turnogol_worker;
REVOKE ALL ON player_reminder_sends FROM PUBLIC;
-- 037 da CRUD por default a turnogol_app en toda tabla nueva: se le saca acá,
-- igual que push_send_log (059), ops_alerts (097) y rival_alert_sends (099).
REVOKE ALL ON player_reminder_sends FROM turnogol_app;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON player_push_subscriptions, player_reminder_sends FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON player_push_subscriptions, player_reminder_sends FROM authenticated;
  END IF;
END $$;
