-- ============================================================
-- 008_revokes.sql
-- REVOKE de permisos peligrosos sobre tablas inmutables.
--
-- Fixes aplicados:
--   * #20 doc13: audit_logs es INSERT ONLY.
--   * #21 F2:    daily_cash_closes es INMUTABLE post-cierre.
--   * Create turnogol_app role defensively if it does not yet exist.
-- ============================================================

-- Create app role defensively (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_app') THEN
    CREATE ROLE turnogol_app NOLOGIN;
  END IF;
END $$;

-- audit_logs: solo INSERT (registro de auditoría inmutable).
REVOKE UPDATE, DELETE ON audit_logs FROM turnogol_app;

-- daily_cash_closes: post-cierre, las correcciones se hacen vía cash_flows compensatorios.
REVOKE UPDATE, DELETE ON daily_cash_closes FROM turnogol_app;

-- \echo '008_revokes.sql aplicado: REVOKE UPDATE/DELETE en audit_logs + daily_cash_closes'
