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
-- Rollback: DROP INDEX idx_bookings_late_cancel; ALTER TABLE bookings DROP
-- COLUMN canceled_late; (el código nuevo deja de correr antes, sino rompe).
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS canceled_late boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bookings_late_cancel
  ON bookings (tenant_id, canceled_at)
  WHERE canceled_late;
