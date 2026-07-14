-- ============================================================
-- 044_no_show_softban.sql
-- Reemplaza la deuda por no-show (022_ptr_balance.sql, cambio #5) por un
-- softban temporal por reincidencia. La deuda de dinero se sentía riesgosa y
-- desproporcionada (cobraba plata nunca entregada y bloqueaba sin plazo);
-- ahora la 1ra ausencia solo se registra y la 2da dentro de una ventana de 90
-- días dispara un bloqueo de 14 días vía tenant_player_bans (mecanismo ya
-- existente, no se crea nada nuevo para el bloqueo en sí).
--
-- balance solo lo escribía addNoShowDebt (confirmado por auditoría de código,
-- ningún otro flujo mete plata ahí) — se elimina junto con toda la UI/lógica
-- de cobro de deuda. Pre-deploy: sin datos, el drop no pierde información real.
-- ============================================================

ALTER TABLE player_tenant_relationships
  DROP COLUMN IF EXISTS balance;

ALTER TABLE player_tenant_relationships
  ADD COLUMN IF NOT EXISTS last_no_show_at TIMESTAMPTZ;

COMMENT ON COLUMN player_tenant_relationships.last_no_show_at IS
  'Momento de la última ausencia marcada, usado para la ventana de reincidencia (90 días) del softban. NULL si nunca faltó.';

COMMENT ON COLUMN player_tenant_relationships.noshow_count IS
  'Contador de ausencias dentro de la ventana de reincidencia vigente (se resetea a 1 si la ausencia actual ocurre 90+ días después de la anterior). Alcanza 2 dispara un softban de 14 días.';
