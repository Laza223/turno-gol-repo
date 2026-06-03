-- ============================================================
-- 021_force_row_level_security.sql
-- Defense-in-depth: FORCE ROW LEVEL SECURITY en las 12 tablas
-- aisladas + la tabla híbrida player_tenant_relationships.
--
-- Contexto:
--   * ENABLE ROW LEVEL SECURITY (006) aplica RLS a roles normales, pero el
--     DUEÑO de la tabla la BYPASSA por default. Si la app llegara a conectar
--     con el rol owner del schema, las policies tenant_isolation_* NO se
--     aplicarían y habría fuga cross-tenant (ver auditoría AUDIT_01/06).
--   * FORCE ROW LEVEL SECURITY hace que RLS aplique TAMBIÉN al owner.
--   * Nota: superusuarios y roles con BYPASSRLS siguen ignorando RLS (Postgres
--     no lo permite forzar). Por eso la app debe conectar con un rol NO
--     superusuario en producción; este FORCE es la red de seguridad para el
--     caso owner. Los filtros explícitos por tenant_id/player_id en las queries
--     (defense-in-depth a nivel app) son la otra capa.
--
-- Idempotente: FORCE ROW LEVEL SECURITY puede re-ejecutarse sin efecto.
-- ============================================================

ALTER TABLE courts FORCE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
ALTER TABLE cash_flows FORCE ROW LEVEL SECURITY;
ALTER TABLE abonados FORCE ROW LEVEL SECURITY;
ALTER TABLE daily_cash_closes FORCE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_player_bans FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_staff_members FORCE ROW LEVEL SECURITY;
ALTER TABLE player_tenant_relationships FORCE ROW LEVEL SECURITY;
