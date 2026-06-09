-- ============================================================
-- 022_ptr_balance.sql
-- BLOCKER fix (triage_fixes #2/#7/#23): saldo deudor del jugador por complejo.
--
-- CLAUDE.md define `player_tenant_relationships.balance` (centavos de ARS): si
-- es > 0, el jugador queda bloqueado para reservar online en ese complejo. La
-- columna faltaba en el schema y `createOnlineBooking` nunca chequeaba el saldo,
-- por lo que un jugador con deuda podía seguir reservando online.
--
-- No es una billetera virtual (ADR / CLAUDE.md): refunds y no-shows se concilian
-- entre jugador y complejo; esta columna solo registra el saldo deudor que el
-- complejo asienta para gatear la reserva online.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. La columna hereda las policies RLS
-- existentes de player_tenant_relationships (no requiere policies nuevas).
-- ============================================================

ALTER TABLE player_tenant_relationships
  ADD COLUMN IF NOT EXISTS balance INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN player_tenant_relationships.balance IS
  'Saldo deudor del jugador en este complejo, en centavos de ARS. Si > 0, el jugador queda bloqueado para reservar online (ver createOnlineBooking).';
