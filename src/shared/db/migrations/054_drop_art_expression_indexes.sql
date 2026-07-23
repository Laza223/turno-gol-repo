-- ============================================================================
-- 054 — Drop de los índices de expresión ART creados en 053 (D3).
--
-- Hallazgo D3 (2026-07-23): bajo el pool real `turnogol_app` con RLS activa,
-- el planner NUNCA puede usar estos índices. La expresión
-- `(occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date` llama a
-- timezone(), que NO es LEAKPROOF, y Postgres se niega a evaluar quals
-- no-leakproof debajo de la barrera de seguridad de las policies → la
-- expresión no entra como Index Cond y la query cae a Seq Scan (medido:
-- 7.7 ms / 388 buffers vs 0.13 ms / 40 buffers del rango sargable, seed D3).
--
-- La verificación de 053 se hizo como superusuario (BYPASSRLS implícito),
-- donde el índice SÍ matchea — misma trampa "local enmascara" de PR #30,
-- ahora a nivel planner.
--
-- Fix real (D3, mismo commit): los 8 callers estilo expresión migraron a
-- rango UTC sargable [date 03:00Z, date+1 03:00Z) vía artDayRangeUtc()
-- (src/shared/time/art-date.ts), que entra por los índices crudos existentes
-- idx_cash_flows_tenant_date / idx_stock_movements_tenant_day con operadores
-- leakproof. Estos dos índices quedaban como costo de escritura puro.
-- ============================================================================

DROP INDEX IF EXISTS idx_cash_flows_tenant_day_art;
DROP INDEX IF EXISTS idx_stock_movements_tenant_day_art;
