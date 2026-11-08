-- "Dar por perdido": el staff resigna lo que falta cobrar de un turno jugado.
-- Tabla propia (una fila por turno) y no columna de bookings: el trigger
-- enforce_booking_invariants_fn bloquea todo UPDATE de un turno `completed`.
-- Sin columna de motivo a propósito (Ley 25.326): quién y cuándo, en written_off_by y audit_logs.
CREATE TABLE booking_write_offs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),
  amount integer NOT NULL CHECK (amount > 0),
  written_off_by uuid NOT NULL REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_booking_write_offs_tenant_created ON booking_write_offs (tenant_id, created_at);

ALTER TABLE booking_write_offs ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_write_offs FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_write_offs_tenant ON booking_write_offs FOR ALL TO turnogol_app
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
-- Sin UPDATE: un perdido se crea o se borra, nunca se edita.
GRANT SELECT, INSERT, DELETE ON booking_write_offs TO turnogol_app, turnogol_worker;
-- 037/038 dan UPDATE por default a toda tabla nueva: se revoca explícito (precedente: 008_revokes.sql).
REVOKE UPDATE ON booking_write_offs FROM turnogol_app, turnogol_worker;
REVOKE ALL ON booking_write_offs FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON booking_write_offs FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON booking_write_offs FROM authenticated; END IF;
END $$;
