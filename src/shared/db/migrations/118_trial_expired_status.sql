-- ============================================================
-- 118_trial_expired_status.sql
-- Fin del freemium (docs/decisions/2026-11-27-prueba-30-dias-y-precios.md):
-- estado `trial_expired` del lifecycle, en tenants y en tenant_subscriptions.
-- El complejo que no paga (prueba vencida, mora terminada o baja al final del
-- período) queda con la ficha pública sin horarios y el panel en solo lectura.
--
-- Va SOLA en su archivo: un valor de enum agregado no se puede usar en la misma
-- transacción (55P04) y `supabase db push` aplica cada archivo en una
-- transacción. Mismo patrón que la 110.
--
-- Aditiva e inerte: ningún código escribe `trial_expired` hasta el PR que lo
-- trae. El valor `free` queda sin uso cuando ese PR migre las filas.
--
-- Rollback: un valor de enum no se borra; queda sin uso.
-- ============================================================

ALTER TYPE tenant_status ADD VALUE IF NOT EXISTS 'trial_expired';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'trial_expired';
