-- ============================================================
-- 113: borra tenants.online_cap_month
--
-- La agregó la 111 como cache del tope mensual de reservas online del plan
-- gratis. El tope se sacó (decisión del 2026-11-16, PR #603) y desde ese PR
-- ningún archivo de src/, tests/ ni scripts/ la lee ni la escribe. El
-- CHECK chk_tenants_online_cap_month se borra junto con la columna.
--
-- Seguro en el mismo release: el código que la leía ya salió en el #603 y
-- ninguna función SQL la referencia (rival_board y compañía no la tocan).
--
-- Rollback (a mano, los valores no se recuperan; eran un cache sin autoridad):
--   ALTER TABLE tenants ADD COLUMN online_cap_month text;
--   ALTER TABLE tenants ADD CONSTRAINT chk_tenants_online_cap_month
--     CHECK (online_cap_month IS NULL OR online_cap_month ~ '^\d{4}-(0[1-9]|1[0-2])$');
-- ============================================================

ALTER TABLE tenants DROP COLUMN IF EXISTS online_cap_month;
