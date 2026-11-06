-- Outbox durable de avisos del staff. Deploy aditivo; activar sólo después del piloto.
ALTER TYPE notification_channel ADD VALUE IF NOT EXISTS 'push';

ALTER TABLE notifications ADD COLUMN event_key text,
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN expires_at timestamptz;
CREATE UNIQUE INDEX idx_notifications_event_recipient_channel
  ON notifications (tenant_id, recipient_id, channel, event_key);
CREATE INDEX idx_notifications_push_pending ON notifications (available_at)
  WHERE channel <> 'email' AND status IN ('queued','sending');

ALTER TABLE push_send_log
  ADD COLUMN notification_id uuid REFERENCES notifications(id) ON DELETE CASCADE,
  ADD COLUMN subscription_id uuid,
  ADD COLUMN status text NOT NULL DEFAULT 'legacy_unknown',
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN lease_until timestamptz,
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN accepted_at timestamptz,
  ADD COLUMN processed_at timestamptz,
  ADD COLUMN opened_at timestamptz,
  ADD COLUMN last_error text;
CREATE INDEX idx_push_send_log_notification ON push_send_log(notification_id);
CREATE INDEX idx_push_send_log_pending ON push_send_log(next_attempt_at)
  WHERE status IN ('queued','sending');

CREATE TABLE staff_agenda_state (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  operating_date date NOT NULL,
  first_booking_id uuid,
  first_starts_at timestamptz,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  started boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE staff_agenda_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_agenda_state FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_agenda_tenant ON staff_agenda_state FOR ALL TO turnogol_app
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_agenda_state TO turnogol_app, turnogol_worker;
REVOKE ALL ON staff_agenda_state FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON staff_agenda_state FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON staff_agenda_state FROM authenticated; END IF;
END $$;

INSERT INTO feature_flags(key,value,tenant_id) VALUES ('staff_notifications_v2',false,NULL)
  ON CONFLICT DO NOTHING;
