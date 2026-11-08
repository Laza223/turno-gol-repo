-- ============================================================
-- 109_cancel_reason_code.sql
-- Motivo de cancelación como lista CERRADA (decisión de Lazar, 2026-11-08).
--
-- Reemplaza el texto libre de `canceled_reason` por un código contable, para
-- que el dueño vea en Métricas por qué se le caen los turnos. Texto libre sobre
-- personas está vetado (Ley 25.326): ver CLAUDE.md, "Vetos de producto".
--
-- Aditiva e inerte: columna NULL, ningún código viejo la lee ni la escribe.
-- `canceled_reason` NO se toca ni se dropea en este release; sin backfill (el
-- trigger enforce_booking_invariants_fn prohíbe UPDATE sobre reservas terminales:
-- las cancelaciones anteriores y las del bot de WhatsApp quedan sin código).
--
-- Agregar un motivo nuevo es aditivo: ALTER TYPE cancel_reason ADD VALUE + la
-- lista y el label en src/shared/cancel-reasons.ts.
--
-- Rollback (el código nuevo deja de correr antes, sino rompe):
--   DROP INDEX idx_bookings_canceled_reason_code;
--   ALTER TABLE bookings DROP COLUMN canceled_reason_code;
--   DROP TYPE cancel_reason;
-- ============================================================

CREATE TYPE cancel_reason AS ENUM (
  'rain',
  'no_players',
  'rival_no_show',
  'reschedule',
  'injury_or_issue',
  'court_unavailable',
  'complex_event',
  'other'
);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS canceled_reason_code cancel_reason;

CREATE INDEX IF NOT EXISTS idx_bookings_canceled_reason_code
  ON bookings (tenant_id, canceled_at)
  WHERE canceled_reason_code IS NOT NULL;
