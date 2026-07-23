-- ============================================================
-- 056_function_hardening.sql
-- Auditoría de datos, fase D5 (infra) — advisors de Supabase (D2-H3):
--
-- 1) `function_search_path_mutable` en 5 funciones trigger. Sin search_path
--    fijo, un rol con CREATE en algún schema que quede ANTES de `public` en
--    el search_path de la sesión invocadora podría "esconder" una tabla
--    homónima y desviar el trigger hacia ella. Fijar search_path='public'
--    cierra el vector sin cambiar comportamiento: las 5 viven enteras en el
--    schema public. Cuerpos leídos ANTES de tocar (incluidas las
--    redefiniciones más recientes, no solo la versión original de 005):
--      * trigger_set_updated_at() — 005_triggers.sql:13. Solo asigna
--        NEW.updated_at := NOW(); no referencia ninguna tabla.
--      * enforce_booking_invariants_fn() — definida en 005_triggers.sql:50,
--        redefinida en 030_no_show_24h_correction.sql:16 y por última vez
--        (vigente) en
--        045_allow_player_anonymization_on_terminal_bookings.sql:32. Usa
--        NEW/OLD (row types del trigger) + to_jsonb() (builtin de
--        pg_catalog, siempre resoluble sin importar search_path) — cero
--        tablas.
--      * prevent_duplicate_active_ban() — 005_triggers.sql:89. Referencia
--        tenant_player_bans sin calificar.
--      * validate_notification_recipient() — 005_triggers.sql:123.
--        Referencia players, staff_users, tenant_staff_members sin
--        calificar.
--      * audit_system_admins_change() — 012_system_admins_audit.sql:14.
--        Referencia audit_logs sin calificar.
--    Ninguna de las 5 referencia un schema fuera de public → SET
--    search_path='public' es correcto (NO '' vacío: rompería las 4 que sí
--    referencian tablas — solo trigger_set_updated_at() sobreviviría a un
--    search_path vacío).
--
-- 2) recalc_tenant_from_price(uuid) — def. en
--    019_tenants_amenities_from_price.sql:29, redefinida en
--    020_public_backend_review_fixes.sql:34, 031_recalc_from_price_scalar.sql:25
--    y por última vez (vigente) en 032_court_surface_format.sql:45. Ya trae
--    `SET search_path = public, pg_temp` desde 019 (por eso NO figura en el
--    hallazgo de search_path mutable) pero es SECURITY DEFINER y, al no
--    haber REVOKE explícito, conserva el GRANT EXECUTE a PUBLIC que
--    Postgres otorga por default a toda función nueva → anon/authenticated
--    (roles de PostgREST) pueden invocarla como RPC
--    (`/rest/v1/rpc/recalc_tenant_from_price`) y forzar el recálculo de
--    tenants.from_price_cents/court_surfaces/court_formats para CUALQUIER
--    tenant_id, sin pasar por RLS (SECURITY DEFINER corre como el owner).
--    Único caller legítimo verificado: el trigger trg_courts_recalc_from_price
--    (019:52-70, también SECURITY DEFINER) al hacer PERFORM
--    recalc_tenant_from_price(...) — grep de src/ (código de aplicación) NO
--    encontró ningún caller directo desde turnogol_app/turnogol_worker
--    tampoco. Se revoca de PUBLIC/anon/authenticated y se re-otorga EXECUTE
--    explícito a turnogol_app/turnogol_worker para que ninguno de los dos
--    dependa silenciosamente del default de PUBLIC que acá se cierra (si
--    algún día la app necesita invocarla directo, ya está autorizada).
--
-- Guards: pg_proc + pg_namespace (existencia de la función) y pg_roles
-- (existencia de anon/authenticated/turnogol_app/turnogol_worker), mismo
-- estilo IF EXISTS que 037/038 — la función o el rol podrían no existir
-- todavía en una DB parcial.
-- ============================================================

-- ── 1) search_path fijo en las 5 funciones trigger ──────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'trigger_set_updated_at'
  ) THEN
    ALTER FUNCTION public.trigger_set_updated_at() SET search_path = 'public';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enforce_booking_invariants_fn'
  ) THEN
    ALTER FUNCTION public.enforce_booking_invariants_fn() SET search_path = 'public';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'prevent_duplicate_active_ban'
  ) THEN
    ALTER FUNCTION public.prevent_duplicate_active_ban() SET search_path = 'public';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'validate_notification_recipient'
  ) THEN
    ALTER FUNCTION public.validate_notification_recipient() SET search_path = 'public';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'audit_system_admins_change'
  ) THEN
    ALTER FUNCTION public.audit_system_admins_change() SET search_path = 'public';
  END IF;
END $$;

-- ── 2) recalc_tenant_from_price(uuid): cerrar el RPC anon/authenticated ──

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'recalc_tenant_from_price'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.recalc_tenant_from_price(uuid) FROM PUBLIC;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE EXECUTE ON FUNCTION public.recalc_tenant_from_price(uuid) FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE EXECUTE ON FUNCTION public.recalc_tenant_from_price(uuid) FROM authenticated;
    END IF;

    -- Conservar EXECUTE para los roles de la app, explícito (ya no vía el
    -- default de PUBLIC que se acaba de cerrar arriba).
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_app') THEN
      GRANT EXECUTE ON FUNCTION public.recalc_tenant_from_price(uuid) TO turnogol_app;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_worker') THEN
      GRANT EXECUTE ON FUNCTION public.recalc_tenant_from_price(uuid) TO turnogol_worker;
    END IF;
  END IF;
END $$;
