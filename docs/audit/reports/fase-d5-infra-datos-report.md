# Fase D5 — Infra de datos (wave 2 datos) — Report

**Fecha:** 2026-07-23 | **Rama:** `audit/data-d5` | **Estado:** gate verde local; prod pendiente de decisión del dueño

## Método

Exploración del estado real en dos frentes simultáneos: (a) código (client.ts, boss.ts, workers, launch-check, CI, migraciones de roles) vía 2 recon read-only; (b) **prod en vivo** vía Supabase MCP read-only (pg_roles, pg_settings, pg_extension, pg_stat_statements, pg_stat_activity, pg_publication, pg_class/reloptions, tamaños pgboss.*). Después: 4 implementadores en zonas disjuntas + verificación adversarial fresca + gate.

## Estado de prod verificado (2026-07-23, antes de tocar nada)

| Ítem | Valor real | Veredicto |
|---|---|---|
| `pg_stat_statements` | Instalada (1.11, track=top) y reportando | ✅ hallazgo #4 del plan era en parte falso: no había que "activarla" |
| Timeouts `turnogol_app`/`turnogol_worker` | rolconfig NULL — heredan global: statement=120s, **lock=0 (∞)**, **idle_in_tx=0 (∞)** | 🔴 hallazgo #3 confirmado |
| `log_min_duration_statement` | -1 (apagado) | 🟡 |
| `max_connections` | 60 | insumo matriz pooling |
| Publication realtime | solo `bookings` | ✅ vigente per diseño |
| Autovacuum | on, defaults, 0 reloptions per-table; pgboss.job con last_autovacuum reciente | ✅ sano al volumen actual |
| pgboss.job / archive | 3.350 / 7.775 filas (~4 MB); archive rota (oldest 07-22); 0 failed | housekeeping default FUNCIONA; config no deliberada |
| Postgres version | **17** (CI usa postgres:15) | 🟡 divergencia CI↔prod anotada (territorio D7) |
| Migración 054 | **Aplicada en esta sesión** (aprobación del dueño): 0 índices ART residuales, 107 índices, tracking 7 filas | ✅ residuo D3 cerrado |

## 🔴 D5-H1 — pg-boss en Railway conecta como `postgres` (owner), no como `turnogol_app`

**Evidencia (pg_stat_activity prod, 2026-07-23 18:40Z):**

```
usename  | application_name | conns | last_query
postgres | Supavisor        | 10    | WITH nextJob as (SELECT id FROM pgboss.job ...)  ← poller pg-boss
turnogol_worker | Supavisor  | 2     | (pool worker OK)
turnogol_app    | —          | 0     | (cero conexiones)
```

Las 10 conexiones persistentes del poller de pg-boss loguean como `postgres`. **La env `DATABASE_URL` del servicio worker de Railway apunta al superusuario/owner**, no a `turnogol_app`. El diseño de migr. 037/039 (pg-boss corre con `turnogol_app`; grants de schema pgboss dados a ese rol a propósito) está violado por configuración de deploy, no por código.

**Alcance:** en ese proceso, TODO lo que use `getSql()`/`getDb()` (DATABASE_URL) corre como owner: bypassa RLS en cualquier tabla sin FORCE y puede DDL. Las policies con FORCE sí le aplican (migr. 036 + pack 048/049), y el contexto `SET LOCAL` sigue funcionando — por eso nada explotó: funciona, pero sin la barrera diseñada.

**Clase revelada de paso:** `bypassRlsCheck` de launch-check (B11) valida `pg_roles.rolbypassrls = false` para current_user — `postgres` de Supabase PASA ese check (no tiene el atributo) pero es owner → el check no caza esta clase. Hardening agregado en esta fase: assert `current_user = 'turnogol_app'` / `'turnogol_worker'` por DSN.

**Fix (operativo, REQUIERE ACCIÓN DEL DUEÑO):** cambiar `DATABASE_URL` del servicio worker en Railway al DSN de `turnogol_app` (mismo formato que la de Vercel). Verificación posterior: pg_stat_activity debe mostrar el poller como `turnogol_app`. Pendiente además confirmar qué usuario lleva la `DATABASE_URL` de Vercel (sin tráfico no hay conexiones visibles desde la DB; el pull de env fue denegado en sesión — verificación de 10 segundos en el dashboard de Vercel, o esperar el check nuevo de launch-check que ahora asserta `current_user = 'turnogol_app'`).

## pg_stat_statements — baseline prod (T8)

Top queries acumuladas (app aún sin tráfico de clientes):

| calls | total ms | query |
|---|---|---|
| 2.084.163 | 46.720 | poller pg-boss `WITH nextJob ...` — **domina la DB** |
| 24.031 | 10.746 | `pgbouncer.get_auth` (Supavisor auth) |
| 13.555 | 7.966 | INSERT pgboss.job |
| 804 | 3.035 | archive DELETE pg-boss (housekeeping default activo) |

El poller: 14 colas × poll default 2 s ≈ 7 q/s constante. Mitigación en esta fase: `newJobCheckIntervalSeconds` mayor en colas cron (T2). Re-medir baseline post-deploy.

## Matriz de conexiones (T8)

`max_connections = 60` (compute chico). Consumo observado hoy: Supabase internals (PostgREST 2, Supavisor auth 2, exporter 1, mgmt 1) + pg-boss 10 (pool default v9) + worker 2. Total ~18/60.

| Consumidor | DSN | Rol | Pool |
|---|---|---|---|
| App Vercel (serverless) | DATABASE_URL (pooler :6543 transaction) | turnogol_app (a confirmar) | max 3 × instancia (efímeras) |
| Worker Railway: pools código | WORKER_DATABASE_URL (session :5432) | turnogol_worker | max 3 |
| Worker Railway: pg-boss | DATABASE_URL | 🔴 postgres (D5-H1) | default 10 |

Techo teórico bajo pico serverless: N instancias Vercel × 3 vía Supavisor transaction mode (multiplexa; el riesgo real es el pool_size de Supavisor, no max_connections directo). Sin acción necesaria al volumen actual; anotado para D6 (carga).

## Cambios aplicados (T1–T7, 4 implementadores en zonas disjuntas)

### T1 — Migración 055: timeouts por rol (`055_role_timeouts.sql` + espejo)
`turnogol_app`: statement 15s / lock 3s / idle-in-tx 30s (pool web + pg-boss; agresivos a propósito — un request HTTP no necesita más). `turnogol_worker`: 120s / 10s / 120s (sweeps cross-tenant legítimamente lentos). `log_min_duration_statement='300ms'` best-effort en bloque `EXCEPTION WHEN insufficient_privilege` (SUSET; supautils de prod puede negarlo sin tumbar la migración). Guards `IF EXISTS (pg_roles)` idempotentes. Gotcha documentado en el header: `ALTER ROLE ... SET` aplica al LOGIN, no a `SET ROLE` — por eso el test nuevo `tests/integration/role-timeouts.test.ts` verifica por catálogo (`pg_roles.rolconfig`), y el check de launch-check verifica por `SHOW` en la conexión real.

### T7 — Migración 056: hardening de funciones (`056_function_hardening.sql` + espejo)
- `SET search_path='public'` en las 5 funciones trigger del advisor (cuerpos LEÍDOS antes: 4 referencian tablas sin calificar → `''` las rompería; `'public'` cierra el vector sin cambiar comportamiento).
- `recalc_tenant_from_price(uuid)`: era SECURITY DEFINER con EXECUTE de PUBLIC → `anon`/`authenticated` podían invocarla como RPC PostgREST (`/rest/v1/rpc/...`) y forzar recálculo de cualquier tenant. REVOKE de PUBLIC/anon/authenticated + GRANT explícito a turnogol_app/turnogol_worker. Único caller legítimo: el trigger `trg_courts_recalc_from_price` (no depende del grant).
- Verificado en local: `proconfig` con search_path en las 5; `has_function_privilege('anon',...)=false`.

### T2 — pg-boss deliberado (`boss.ts`, `definitions.ts`, 10 workers)
- Constructor explícito: `max: 5` (pool interno; antes default node-pg 10 sin decidir), `archiveCompletedAfterSeconds: 43200`, `deleteAfterDays: 7`, `maintenanceIntervalSeconds: 120` — valores = defaults REALES de pg-boss 9.0.3 verificados en la lib (`attorney.js`/`db.js`), ahora elegidos y comentados.
- `CRON_WORK_OPTIONS = { newJobCheckIntervalSeconds: 30 }` aplicado a las 10 colas cron (incluida solo la sweep de expire-pending-booking). Colas latency-sensitive (`process-mp-webhook`, `push-send`, `send-email`, expire directa) quedan en default 2s. Efecto esperado: el poller (hoy 2,08M calls, top query de prod) baja ~10/14 de su frecuencia.

### T3 — Retención `processed_webhooks` automatizada
`purgeProcessedWebhooks()` en `data-retention-cleanup.worker.ts` (paso GLOBAL, corre antes del early-return del loop per-tenant, semanal): `DELETE ... WHERE processed_at < NOW() - INTERVAL '30 days'` — automatiza lo que doc19 ya fijaba como paso manual. Test `processed-webhooks-retention.test.ts` (borra vieja, conserva fresca, idempotente). Bonus: el runbook tenía `TRUNCATE ... WHERE` (sintaxis inválida en Postgres) — corregido a DELETE como fallback manual.

### T4 — Drift test Drizzle↔SQL (`tests/integration/schema-drift.test.ts`, 56 casos)
27 tablas + columnas (nombre/tipo/nullability) + 25 enums comparados vía `getTableConfig()` contra `information_schema`/`pg_enum` de la DB migrada. CI lo colecta solo (job 3 = dir completo). **Resultado: 0 drift real.** La premisa pre-cargada (`audit_logs.before_state/after_state` "en DB pero no en Drizzle") resultó OBSOLETA: Drizzle ya las declara; lo "muerto" es a nivel código de app (nadie las puebla) — allowlist documental para que no se re-investigue. **Regla leakproof (clase D3-H1):** assert CERO índices de expresión con funciones no-leakproof sobre tablas RLS, con filtro `NOT indisexclusion` justificado (los GIST de EXCLUDE constraints usan `tsrange`/`tstzrange` no-leakproof pero su enforcement no pasa por el planner con RLS — falso positivo verificado). 2 controles positivos ejecutados (enum mutado + filtro removido → el test FALLA como debe).

### T5 — Canario de plan bajo rol real (`tests/integration/query-plan-canary.test.ts`, 3 casos)
`SET LOCAL ROLE turnogol_app` + contexto + `enable_seqscan=off`: 2 canarios positivos (cash_flows forma getDaySummary / stock_movements forma getSalesRanking → Index Cond con la comparación de fecha) + 1 negativo (índice de expresión ART recreado en tx: como superusuario matchea, bajo turnogol_app+RLS la fecha queda relegada a Filter — la clase D3-H1 viva, documentada). Hallazgos empíricos del planner documentados en cabecera: con pocas filas y varios índices `tenant_id`-líder el planner empata arbitrario → seed 40 filas + ANALYZE; el negativo nunca da "Seq Scan" literal (otros índices sirven la igualdad de tenant) → el assert correcto es sobre el contenido de Index Cond, no el Node Type. Control positivo ejecutado (caller mutado a expresión → falla con plan pegado).

### T6 — sslmode + launch-check
- `.env.example`/`.env.staging.example`: `sslmode=require` en DSNs remotos de ejemplo; comentarios en `railway.toml`/`Dockerfile.worker`.
- 3 checks fatales nuevos en `launch-check.ts`: **`role identity check`** (`current_user` = turnogol_app/turnogol_worker por DSN — caza la clase D5-H1: `postgres` pasa `bypassRlsCheck` porque rolbypassrls=false pero es owner), **`role session timeouts`** (`SHOW statement_timeout`='15s' en la conexión real — detecta 055 sin aplicar O DSN con rol equivocado), **`ssl in use`** (`pg_stat_ssl` por DSN).

## Verificación adversarial (RECHAZADO → fixes → gate re-verificado)

El verificador fresco (leyó el diff antes que los resúmenes, reprodujo empíricamente contra la DB local) **RECHAZÓ la primera versión** con 3 hallazgos accionables — todos atendidos en el mismo ciclo:

1. 🔴 **Canario positivo de cash_flows frágil al desempate del planner**: con stats distintas (el propio verificador había sembrado 500k filas para otro ataque) el planner elegía `idx_cash_flows_tenant_type` y el rango quedaba como Filter — plan CORRECTO, canario rojo. **Fix:** los 2 positivos ahora usan el mismo patrón que el negativo (fase superusuario en tx que DROPea los índices competidores `tenant_id`-líder, rollback al final) → con un único candidato el assert prueba exactamente lo que la clase D3-H1 exige. Re-corrido 3× consecutivas verde.
2. 🟡 **Clase Saga viva en el camino de pagos** (insumo directo pre-cargado a D4, que ya la tiene en scope): `mp-webhook.handler.ts:84-196` y `billing.service.ts:422-424` (`handleUpgradeApproved`) llaman a MP DENTRO de `withTenantContext` — violando el patrón que `payment.service.ts:653-660` documenta y que settleRefund/reconcile sí siguen. El `fetch` de `refreshMpAccessToken` era además el único HTTP ILIMITADO de la cadena (ni SDK ni breaker lo acotan). Con idle_in_tx finito (055), un OAuth lento habría matado la tx del webhook. **Mitigación en esta fase (el fix de la clase es scope D4):** `AbortSignal.timeout(MP_GET_TIMEOUT_MS)` en el fetch OAuth + idle_in_transaction de `turnogol_app` 30s→**60s** (margen 2× sobre el worst-case ~24s de HTTP acotado dentro de tx; sigue siendo finito vs el infinito previo; bajar a 30s cuando D4 cierre la clase).
3. 🟡 **`purgeProcessedWebhooks` sin try/catch acoplaba housekeeping a la purga legal**: un fallo del DELETE global abortaba el wipe Ley 25.326 de tenants. **Fix:** try/catch log-and-continue (reintenta la semana siguiente).

Verificado y CORRECTO por el verificador (no re-auditar): options reales de pg-boss 9.0.3 contra la lib; REVOKE de 056 probado empíricamente (el trigger de courts sigue funcionando bajo turnogol_app; anon/authenticated perdieron EXECUTE); search_path='public' ejercitado en los triggers sin romper nada (un bloqueo de notifications bajo RLS resultó PRE-existente, con control); espejos byte-idénticos; D3-H3 (export CSV) corre en ~1s con 500k filas — no amenazado por statement_timeout 15s; orden lexicográfico y bloques DO bajo psql OK.

## Gate final (post-fixes)

| Check | Resultado |
|---|---|
| `pnpm typecheck` | ✅ limpio |
| `pnpm lint` | ✅ 0 errors (34 warnings pre-existentes react-hooks) |
| `pnpm test` (unit) | ✅ 260 archivos / 2003 tests |
| `pnpm test:integration` | ✅ 99 archivos / **738/738**, exit 0 (676→738: +62 de los 4 tests nuevos) |
| `pnpm test:isolation` (BLOQUEANTE) | ✅ 123/123 |
| Canario de plan | ✅ 3 corridas consecutivas verdes post-fix (determinismo verificado) |
| 055 re-aplicada local (idle 60s) | ✅ rolconfig verificado; NOTICE del SUSET esperado (local también restringe `log_min_duration_statement` — el EXCEPTION funciona; en prod fallback dashboard) |

## REQUIERE INPUT (dueño)

1. **DSN Railway (D5-H1)**: cambiar `DATABASE_URL` del servicio worker a turnogol_app. Confirmar DSN Vercel.
2. **PITR/backups**: la auto-pausa de julio sugiere free tier → posiblemente SIN backups gestionados hoy. Definir RPO y plan.
3. **Retención `audit_logs`** (propuesta 24 meses) y **`notifications`** (propuesta 6 meses) — hoy crecen sin techo; solo se borran en erasure de tenant.
4. **Aplicar 055+056 a prod** tras gate verde.
