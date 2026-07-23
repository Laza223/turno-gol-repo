-- ============================================================
-- 055_role_timeouts.sql
-- Auditoría de datos, fase D5 (infra) — hallazgo D5 #3: turnogol_app y
-- turnogol_worker tienen pg_roles.rolconfig NULL en prod (verificado
-- 2026-07-23): CERO timeouts propios. Heredan los defaults globales del
-- cluster — statement_timeout=120s (compartido con TODO, incluidos jobs
-- lentos legítimos), lock_timeout=0 (INFINITO: un lock colgado espera para
-- siempre, no corta) e idle_in_transaction_session_timeout=0 (INFINITO: una
-- conexión que abre una tx y se cuelga nunca libera el slot). El hallazgo
-- nació de un lock colgado que esperó indefinidamente porque no había
-- timeout de rol que lo cortara.
--
-- turnogol_app (037_turnogol_app_grants.sql): rol restringido del pool web
-- (Vercel, DATABASE_URL) + pg-boss (boss.ts conecta con DATABASE_URL, ver
-- doc12/client.ts). 15s/3s/60s son agresivos a propósito: un request HTTP
-- no debería necesitar más, y un lock/tx colgados en un endpoint degradan
-- el resto del tráfico del tenant. Racional pg-boss: su maintenance interno
-- (archive/purge, boss.ts) hereda los mismos 15s al conectar como
-- turnogol_app — hoy tarda milisegundos (pg_stat_statements de prod),
-- margen amplio.
--
-- turnogol_worker (038_turnogol_worker_role.sql): rol BYPASSRLS de los
-- background jobs (Railway, WORKER_DATABASE_URL). 120s/10s/120s son más
-- laxos: sweeps cross-tenant (dunning, retention, expiry) y seeds largos
-- pueden legítimamente tardar más que un request HTTP.
--
-- Gotcha (crítico para quien lea/valide esto): `ALTER ROLE ... SET` aplica
-- al LOGIN de la sesión — el rolconfig se carga cuando la conexión
-- autentica CON ESE ROL, NO cuando una sesión ya conectada hace
-- SET ROLE / SET LOCAL ROLE hacia él. En prod esto alcanza porque los DSN
-- (DATABASE_URL, WORKER_DATABASE_URL) loguean directamente como
-- turnogol_app/turnogol_worker. En CI/tests locales los roles se crean
-- NOLOGIN (037/038 + ensureRoles) y la conexión de test loguea como
-- `postgres` (superuser) — un SET ROLE turnogol_app desde ahí NO hereda
-- este rolconfig. Por eso tests/integration/role-timeouts.test.ts verifica
-- por catálogo (pg_roles.rolconfig), no reconectando/impersonando el rol.
--
-- log_min_duration_statement: GUC clase SUSET. El `postgres` de CI
-- (superuser real) puede hacer ALTER ROLE ... SET sobre él sin problema; el
-- `postgres` de Supabase prod corre detrás de la extensión supautils, que
-- puede negarle este SET puntual aunque sea el rol "superuser" lógico de la
-- instancia gestionada. Va en su propio bloque con
-- EXCEPTION WHEN insufficient_privilege para que la migración NO aborte si
-- prod lo rechaza — queda como RAISE NOTICE (fallback: setearlo a mano
-- desde el dashboard de Supabase, Database → Roles, si hace falta).
--
-- Guards DO $$ IF EXISTS (pg_roles) $$ — mismo estilo que 037/038: los
-- roles podrían no existir todavía en un ambiente parcial/exótico.
-- ============================================================

-- idle_in_transaction 60s (no 30s): la verificación adversarial D5 encontró
-- que mp-webhook.handler y handleUpgradeApproved todavía llaman a MP DENTRO
-- de la tx (clase Saga, pre-cargada a D4) — worst case ~24s de HTTP acotado
-- (2× getPaymentStatus a 8s + refresh OAuth a 8s, ver mp-oauth.ts). 60s da
-- margen 2x sin perder la protección (antes era INFINITO). Cuando D4 saque
-- las llamadas MP de la tx, se puede bajar a 30s.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_app') THEN
    ALTER ROLE turnogol_app SET statement_timeout = '15s';
    ALTER ROLE turnogol_app SET lock_timeout = '3s';
    ALTER ROLE turnogol_app SET idle_in_transaction_session_timeout = '60s';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_worker') THEN
    ALTER ROLE turnogol_worker SET statement_timeout = '120s';
    ALTER ROLE turnogol_worker SET lock_timeout = '10s';
    ALTER ROLE turnogol_worker SET idle_in_transaction_session_timeout = '120s';
  END IF;
END $$;

-- log_min_duration_statement: best-effort, GUC SUSET (ver header). No debe
-- tumbar la migración si el ambiente gestionado lo rechaza.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_app') THEN
    BEGIN
      ALTER ROLE turnogol_app SET log_min_duration_statement = '300ms';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'turnogol_app: sin privilegio para setear log_min_duration_statement (SUSET, supautils de prod puede bloquearlo) -- setear a mano desde el dashboard de Supabase si hace falta';
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_worker') THEN
    BEGIN
      ALTER ROLE turnogol_worker SET log_min_duration_statement = '300ms';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'turnogol_worker: sin privilegio para setear log_min_duration_statement (SUSET, supautils de prod puede bloquearlo) -- setear a mano desde el dashboard de Supabase si hace falta';
    END;
  END IF;
END $$;
