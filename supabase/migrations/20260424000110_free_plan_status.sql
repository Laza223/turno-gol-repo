-- ============================================================
-- 110_free_plan_status.sql
-- Plan gratis del freemium (docs/decisions/2026-11-08-freemium-spec-y-estado-free.md):
-- noveno estado `free` del lifecycle, en tenants y en tenant_subscriptions.
--
-- Va SOLA en su archivo: un valor de enum agregado no se puede usar en la misma
-- transacción (55P04) y `supabase db push` aplica cada archivo en una
-- transacción. La 111 es la que lo usa.
--
-- Aditiva e inerte: ningún código escribe `free` hasta el release que lo trae
-- (PR del freemium, después de este). Los workers del lifecycle viejo nunca
-- llegan a este valor.
--
-- Rollback: un valor de enum no se borra. Si se abandona el plan gratis, queda
-- sin uso (o se renombra con ALTER TYPE ... RENAME VALUE).
-- ============================================================

ALTER TYPE tenant_status ADD VALUE IF NOT EXISTS 'free';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'free';
