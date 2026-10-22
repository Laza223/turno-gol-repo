-- ============================================================
-- 098_late_cancel.sql
-- Penalidad por cancelación tardía (complejos SIN seña).
--
-- Racional: docs/decisions/2026-10-21-cancelacion-tardia.md
--
-- `bookings.canceled_late` marca la cancelación que contó para la escalera
-- (aviso / 7 días / 30 días sin reservar online). El contador sale de estas
-- mismas filas (últimos 60 días), así que no hay tabla nueva.
--
-- Aditiva e inerte: DEFAULT false, ningún código viejo la lee ni la escribe, y
-- `settings.late_cancel_hours` ausente = 0 = apagado.
--
-- `tenant_player_bans.late_cancel_reset_at`: corte del conteo cuando el dueño
-- levanta un bloqueo por tardías. No se puede resetear `canceled_late` en las
-- reservas porque `enforce_booking_invariants_fn` (089) prohíbe todo UPDATE
-- sobre una reserva terminal; el conteo solo cuenta lo posterior al corte.
--
-- Rollback: DROP INDEX idx_bookings_late_cancel; ALTER TABLE bookings DROP
-- COLUMN canceled_late; ALTER TABLE tenant_player_bans DROP COLUMN
-- late_cancel_reset_at; (el código nuevo deja de correr antes, sino rompe).
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS canceled_late boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bookings_late_cancel
  ON bookings (tenant_id, canceled_at)
  WHERE canceled_late;

ALTER TABLE tenant_player_bans
  ADD COLUMN IF NOT EXISTS late_cancel_reset_at timestamptz;
