-- ============================================================
-- 008_revokes.sql
-- REVOKE de permisos peligrosos sobre tablas inmutables.
--
-- Fixes aplicados:
--   * #20 doc13: audit_logs es INSERT ONLY.
--   * #21 F2:    daily_cash_closes es INMUTABLE post-cierre.
--
-- Asume que el rol `turnogol_app` ya existe (creado en setup de DB).
-- Si no existe, el archivo falla intencionalmente — agregar el rol antes:
--   CREATE ROLE turnogol_app NOLOGIN;
--   GRANT turnogol_app TO authenticator;  -- (Supabase) o al rol que use el pool.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'turnogol_app') THEN
    CREATE ROLE turnogol_app NOLOGIN;
    GRANT turnogol_app TO authenticator;
  END IF;
END
$$;

-- audit_logs: solo INSERT (registro de auditoría inmutable).
REVOKE UPDATE, DELETE ON audit_logs FROM turnogol_app;

-- daily_cash_closes: post-cierre, las correcciones se hacen vía cash_flows compensatorios.
REVOKE UPDATE, DELETE ON daily_cash_closes FROM turnogol_app;

-- \echo '008_revokes.sql aplicado: REVOKE UPDATE/DELETE en audit_logs + daily_cash_closes'
