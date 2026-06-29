-- ============================================================
-- 035_closes_next_day.sql
-- Día operativo: complejos que cierran después de medianoche.
--
-- `closes_next_day = true` indica que un día cuyo `close` (en opening_hours) sea
-- <= `open` (ej. open 08:00, close 02:00) cierra en la madrugada del día
-- SIGUIENTE. Esos turnos pertenecen al MISMO día operativo (bookings.date = la
-- noche anterior), por lo que caja, cierre diario y reportes agrupan toda la
-- noche junta. El slot 23:00→00:00 se guarda con time_end = '24:00' (TIME válido
-- en Postgres y > '23:00', así pasa chk_time_valid). No cambia el tipo de
-- time_start/time_end ni el CHECK existente.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. Default false = comportamiento previo
-- (cierre el mismo día), así que no hay backfill.
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS closes_next_day BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.closes_next_day IS
  'Día operativo: si true, un día con close <= open cierra en la madrugada del día siguiente; esos turnos pertenecen al día operativo anterior (bookings.date).';
