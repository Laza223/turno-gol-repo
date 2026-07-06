-- ============================================================
-- 036_force_rls_remaining_tables.sql
-- Defense-in-depth (TG-BL-02 / riesgo TG-P2-RLS-02): completa el FORCE ROW
-- LEVEL SECURITY sobre las tablas con RLS que la migración 021 no cubrió.
--
-- 021 forzó las 12 tablas aisladas + player_tenant_relationships. Estas 7 tienen
-- RLS con ENABLE pero quedaron SIN FORCE (globales/híbridas o agregadas después):
--   * players, staff_users     — globales con RLS por jugador / staff.
--   * system_admins            — tabla de sistema, RLS self-scoped.
--   * push_subscriptions       — tenant-scoped (migr. 014).
--   * feature_flags            — global + override por tenant (migr. 015).
--   * reviews                  — lectura pública + insert del dueño (migr. 016).
--   * player_favorites         — player-scoped (migr. 017).
--
-- Sin FORCE, el DUEÑO de la tabla BYPASSA las policies (mismo racional que 021):
-- si la app llegara a conectar con el rol owner del schema, las policies no se
-- aplicarían. Superuser / roles con BYPASSRLS siguen ignorando RLS (Postgres no
-- lo permite forzar); por eso la app conecta con un rol no-owner en producción.
--
-- Idempotente: FORCE ROW LEVEL SECURITY puede re-ejecutarse sin efecto.
-- ============================================================

ALTER TABLE players           FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_users       FORCE ROW LEVEL SECURITY;
ALTER TABLE system_admins     FORCE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE feature_flags     FORCE ROW LEVEL SECURITY;
ALTER TABLE reviews           FORCE ROW LEVEL SECURITY;
ALTER TABLE player_favorites  FORCE ROW LEVEL SECURITY;
