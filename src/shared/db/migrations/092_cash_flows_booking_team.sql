-- ============================================================
-- 092_cash_flows_booking_team.sql
-- Cobro de mostrador por EQUIPO (decisión del dueño 2026-09-25, reabre
-- docs/decisions/2026-09-15-cobro-por-equipo.md): el pago parcial de UN
-- equipo tiene que descontarse de la mitad de ESE equipo, no del que pagó
-- primero. Hoy el reparto se DEDUCE (charge-copy.ts, `teamDues`); esta
-- columna guarda el dato real cuando el mostrador lo carga.
--
-- cash_flows.booking_team: 1 o 2. Nullable a propósito — mismo patrón que
-- tournament_team_id (migr. 066): columna aditiva, sin expand/contract
-- (docs/operations/MIGRATIONS.md), el código viejo que no la conoce sigue
-- funcionando igual, sencillamente sin poblarla.
--
-- El CHECK es unidireccional a propósito, a diferencia de
-- chk_cashflow_tournament_team: booking_team exige category='booking' y
-- booking_id (no tiene sentido un equipo sin turno), pero un cobro de turno
-- SIN equipo sigue siendo válido (cobro genérico "Todo junto", "Pagó uno", o
-- cualquier fila anterior a esta migración).
-- ============================================================

ALTER TABLE cash_flows ADD COLUMN IF NOT EXISTS booking_team smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cashflow_booking_team'
  ) THEN
    ALTER TABLE cash_flows ADD CONSTRAINT chk_cashflow_booking_team CHECK (
      booking_team IS NULL OR (booking_team IN (1, 2) AND booking_id IS NOT NULL AND category = 'booking')
    );
  END IF;
END $$;

COMMENT ON COLUMN cash_flows.booking_team IS
  'A qué equipo (1 o 2) corresponde este cobro de mostrador de un turno. NULL en todo lo que no sea un cobro de turno por equipo: el resto de las categorías, los cobros sin atribuir ("Todo junto", "Pagó uno") y las filas anteriores a esta migración. Decisión del dueño 2026-09-25, reabre docs/decisions/2026-09-15-cobro-por-equipo.md.';
