-- ============================================================
-- 080_trigger_function_grants.sql
-- Advisors de Supabase (medidos el 2026-08-27 con get_advisors(security)):
-- `anon_security_definer_function_executable` +
-- `authenticated_security_definer_function_executable`, 4 WARN en total
-- sobre DOS funciones:
--
--   * public.audit_system_admins_change()   (012_system_admins_audit.sql:14)
--   * public.trg_courts_recalc_from_price() (019_tenants_amenities_from_price.sql:52)
--
-- Las dos son SECURITY DEFINER y conservan el GRANT EXECUTE a PUBLIC que
-- Postgres le da por default a toda función nueva, así que `anon` y
-- `authenticated` (los roles de PostgREST) lo heredan. Es exactamente el
-- mismo hallazgo que 056_function_hardening.sql cerró para
-- recalc_tenant_from_price(uuid) — pero 056 se ocupó SOLO de esa, que es la
-- única con `RETURNS void`, y dejó afuera estas dos.
--
-- ── Por qué NO era explotable, y por qué se cierra igual ────────────────
--
-- El advisor dice que son invocables vía `/rest/v1/rpc/<nombre>`. MEDIDO
-- contra Postgres local, como `anon`, las dos:
--
--   ERROR:  trigger functions can only be called as triggers
--   CONTEXT:  compilation of PL/pgSQL function ... near line 1
--
-- O sea: Postgres mismo rechaza llamar directo a una función `RETURNS
-- trigger`, tenga o no EXECUTE quien llame. El vector que describe el
-- advisor no existe — a diferencia del de 056, donde
-- recalc_tenant_from_price SÍ era invocable y SÍ recalculaba tenants
-- ajenos saltándose RLS.
--
-- Se cierra igual por dos razones, ninguna urgente: (1) un GRANT que no
-- habilita nada es ruido que hace que el panel de advisors deje de ser
-- señal — cuatro WARN permanentes entrenan a ignorarlos, y el próximo WARN
-- real se pierde ahí adentro; (2) deja el mismo criterio en las tres
-- funciones SECURITY DEFINER del schema, en vez de dos tratadas de una
-- forma y una de otra sin razón visible.
--
-- ── Por qué revocar NO rompe los triggers ───────────────────────────────
--
-- Postgres chequea el privilegio EXECUTE de una función trigger al hacer
-- CREATE TRIGGER, no cada vez que el trigger dispara. MEDIDO, no asumido:
-- con EXECUTE ya revocado de PUBLIC/anon/authenticated (y `turnogol_app`
-- devolviendo `has_function_privilege(...) = false`), un INSERT en `courts`
-- conectado COMO turnogol_app disparó igual trg_courts_recalc_from_price:
-- tenants.from_price_cents pasó de NULL a 800000, court_formats a {5} y
-- court_surfaces a {synthetic_grass}. El trigger funciona idéntico.
--
-- Por eso acá NO se re-otorga EXECUTE a turnogol_app/turnogol_worker, a
-- diferencia de 056: aquella función se invoca con PERFORM desde otro
-- trigger y podría llegar a llamarse desde la app, estas dos no se llaman
-- nunca por nombre. Grep de `src/` confirma cero callers directos de las
-- dos.
--
-- Guards con pg_proc/pg_namespace + pg_roles, mismo estilo que 037/038/056:
-- la función o el rol pueden no existir en una DB parcial. Idempotente —
-- REVOKE sobre un privilegio ya revocado es un no-op.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'audit_system_admins_change'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.audit_system_admins_change() FROM PUBLIC;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE EXECUTE ON FUNCTION public.audit_system_admins_change() FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE EXECUTE ON FUNCTION public.audit_system_admins_change() FROM authenticated;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'trg_courts_recalc_from_price'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.trg_courts_recalc_from_price() FROM PUBLIC;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE EXECUTE ON FUNCTION public.trg_courts_recalc_from_price() FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE EXECUTE ON FUNCTION public.trg_courts_recalc_from_price() FROM authenticated;
    END IF;
  END IF;
END $$;
