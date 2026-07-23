# Fase D5 — Infra de datos (Implementation Plan)

**Goal:** la capa entre el código y Postgres configurada a propósito, no por default. Done-criteria MASTER_PLAN D5: timeouts activos y testeados; `pg_stat_statements` reportando en prod; drift test corriendo en CI; decisiones de plata elevadas como REQUIERE INPUT.

**Worktree:** `audit/data-d5` (`C:\Users\Lazar\Documents\github\TurnoGol-d5`). Commits `audit(d5):`.

## Estado verificado (exploración 2026-07-23)

| Frente | Estado actual | Evidencia |
|---|---|---|
| Timeouts sesión | CERO en código/migraciones/roles. Prod: `turnogol_app`/`turnogol_worker` rolconfig NULL; global statement=120s, lock=0 (∞), idle_in_tx=0 (∞) | `client.ts:54-58,151-155`; migr. 037-039 sin `ALTER ROLE SET`; pg_roles prod |
| pg_stat_statements | YA instalada en prod (1.11, track=top) y reportando. `log_min_duration_statement=-1` (apagado) | pg_extension + pg_settings prod |
| sslmode | Ningún DSN de ejemplo lo lleva; código no fuerza `ssl` | `.env.example:9`, `.env.staging.example:33`, client.ts |
| Drift test | NO existe. drizzle-kit en devDeps sin script check. Drift real conocido: `audit_logs.before_state/after_state` muertas | grep tests/; HAPPY_PATHS_RUN:166 |
| pg-boss | Constructor default puro (`boss.ts:28`: solo connectionString+schema). Poller = top query prod (2,08M calls). Failed→Sentry ya existe (`dlq.ts:81-109`); depth endpoint ya existe | boss.ts, dlq.ts, pg_stat_statements prod |
| Retención | `audit_logs`/`notifications` SOLO se borran en erasure por-tenant; `processed_webhooks` purga manual runbook 30d | data-retention-cleanup.worker.ts:229-230; doc19:174-175 |
| Realtime publication | Solo `bookings` ✅ vigente (verificado prod) | pg_publication |
| Autovacuum | Defaults en todo (0 reloptions). pgboss.job autovacuum corriendo OK | pg_class prod |
| Pools | app max=3 + worker max=3 + pg-boss sin max (default 10). max_connections prod=60 | client.ts:38-45, boss.ts:28 |
| Hardening (D2-H3) | `function_search_path_mutable` ×5 triggers; `recalc_tenant_from_price` SECURITY DEFINER ejecutable por anon/authenticated | advisors D2 |
| Canario de plan | No existe (observación 1 verificador D3): revertir un caller a expresión ART deja suite verde con Seq Scan bajo RLS | report D3 |

## Tasks

### T1 — Migración 055: timeouts por rol (+ log_min_duration best-effort)
`src/shared/db/migrations/055_role_timeouts.sql` + espejo timestamped (`pnpm db:sync-supabase`).
- `ALTER ROLE turnogol_app SET statement_timeout='15s' / lock_timeout='3s' / idle_in_transaction_session_timeout='30s'`
- `ALTER ROLE turnogol_worker SET statement_timeout='120s' / lock_timeout='10s' / idle_in_transaction_session_timeout='120s'` (sweeps cross-tenant + seed largos)
- Guard `DO $$ IF EXISTS (pg_roles...)` — idempotente, roles pueden no existir en entornos exóticos.
- `log_min_duration_statement='300ms'` por rol en bloque `DO ... EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE` (SUSET: CI-postgres puede; si supautils de prod lo rechaza, la migración NO falla y queda documentado el fallback dashboard).
- **Racional pg-boss:** pg-boss conecta como `turnogol_app` (DATABASE_URL) → su maintenance hereda 15s; hoy archive tarda ms, margen amplio.
- **Gotcha `SET ROLE`:** `ALTER ROLE ... SET` aplica al LOGIN, no a `SET ROLE`. El test NO puede verificar vía SET ROLE: verificar contra catálogo `pg_roles.rolconfig` (test integration nuevo `tests/integration/role-timeouts.test.ts`).
- launch-check: check nuevo `role session timeouts` (lee rolconfig del rol del DSN; patrón `bypassRlsCheck:63-85`).

### T2 — pg-boss: config explícita + poll tuning
- `boss.ts`: constructor con `archiveCompletedAfterSeconds`, `deleteAfterDays`, `maintenanceIntervalSeconds` EXPLÍCITOS (valores = defaults deliberados, comentados — la auditoría documenta la elección).
- Poller 2,08M calls (top query prod): subir `newJobCheckIntervalSeconds` a 30-60s SOLO en colas cron (`generate-abonado-slots`, `expire-trials`, `refresh-mp-tokens`, `data-retention-cleanup`, `dunning-retry`, `retry-pending-refunds`, `auto-complete-bookings`, `reconcile-pending-payments`, `expire-pending-booking-sweep`, `health-ping`) — latencia extra irrelevante para crons. Colas latency-sensitive (`process-mp-webhook`, `push-send`, `send-email`, `expire-pending-booking`) quedan en default.
- `pgboss.archive` sin PK (advisor D2): documentar by-design de la lib en report, no tocar schema ajeno.

### T3 — Retención processed_webhooks (automatizar lo ya decidido)
- doc19 §runbook ya fija 30 días manual → automatizar: paso GLOBAL (no per-tenant) en `data-retention-cleanup.worker.ts`: `DELETE FROM processed_webhooks WHERE processed_at < NOW() - INTERVAL '30 days'` (semanal, pool worker).
- `audit_logs`/`notifications` por antigüedad: **REQUIERE INPUT** (compliance/producto) — NO implementar; elevar con propuesta (24 meses / 6 meses).
- Test integration del paso nuevo (idempotente, respeta ventana).

### T4 — Drift test Drizzle↔SQL en CI
`tests/integration/schema-drift.test.ts` (CI job 3 lo colecta solo — `test:integration` = dir completo sobre postgres:15 migrada vía loop psql).
- `getTableConfig()` (drizzle-orm/pg-core) sobre los 28 archivos de `src/shared/db/schema/` vs `information_schema.columns`/`tables` de la DB migrada: tablas faltantes/sobrantes, columnas (nombre, tipo mapeado, nullability), enums (pg_enum labels vs enums.ts).
- Drift conocido (`audit_logs.before_state/after_state` en DB, no en Drizzle): allowlist explícita con comentario + entrada backlog (drop = contract, va aparte).
- **Regla leakproof (lección D3-H1):** query `pg_index` + `pg_proc.proleakproof` → assert CERO índices de expresión con funciones no-leakproof sobre tablas con RLS. Caza la clase para siempre.

### T5 — Canario de plan bajo rol real (observación verificador D3)
`tests/integration/query-plan-canary.test.ts`:
- `ensureRoles` + seed mínimo + `SET LOCAL ROLE turnogol_app` + `set_config` contexto + `SET LOCAL enable_seqscan=off`.
- EXPLAIN (FORMAT JSON) de las 3 queries clase día-ART como las emite el servicio (rango UTC sargable) → assert Index/Bitmap Scan sobre `idx_cash_flows_tenant_date`/`idx_stock_movements_tenant_day`, NO Seq Scan.
- **Control negativo:** versión expresión `AT TIME ZONE` con enable_seqscan=off SIGUE en Seq Scan (prueba que el canario discrimina la clase; test que no miente).
- `enable_seqscan=off` hace el assert determinista aún con tablas casi vacías (si el índice PUEDE usarse, se usa; si sigue Seq Scan = clase D3-H1).

### T6 — sslmode explícito
- `.env.example` / `.env.staging.example`: DSNs remotos con `?sslmode=require` (localhost sin tocar).
- launch-check: check `ssl in use` — `SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()` sobre DATABASE_URL y WORKER_DATABASE_URL.
- `railway.toml`/`Dockerfile.worker`: comentario recordatorio sslmode.

### T7 — Migración 056: hardening advisors (D2-H3)
- 5 funciones trigger (`trigger_set_updated_at`, `prevent_duplicate_active_ban`, `validate_notification_recipient`, `audit_system_admins_change`, `enforce_booking_invariants_fn`): `ALTER FUNCTION ... SET search_path = 'public'` — **NO `''`**: los cuerpos referencian tablas sin calificar; `'public'` fijo mata el advisor sin romper triggers. Leer cada cuerpo antes de tocar.
- `REVOKE EXECUTE ON FUNCTION recalc_tenant_from_price(uuid) FROM anon, authenticated` (+ PUBLIC).

### T8 — pg_stat_statements baseline + pooling matrix (solo report)
- Snapshot top queries prod al report (ya capturado: poller pg-boss domina).
- Matriz de conexiones: 60 max prod vs (Vercel N instancias × app 3) + worker (3 + pg-boss ~10) + Supavisor. Documentar techo y recomendación (`DATABASE_POOL_MAX`, pg-boss `max` explícito si hace falta).

### T9 — Cierre
- Gate: `pnpm typecheck` + `lint` + `test` + `test:integration` + `test:isolation` (Supabase local).
- Verificación adversarial fresca (sonnet-adversarial-reviewer, lee diff antes que resumen).
- Aplicar 055+056 a prod → **pedir aprobación del dueño** (junto con REQUIERE INPUT: PITR RPO/plata, retención audit_logs/notifications).
- Report `docs/audit/reports/fase-d5-infra-datos-report.md` + STATE.md + PROGRESS.md.
- PR a main.

## Delegación (ledger en PROGRESS)

| Quién | Qué | Zona (disjunta) |
|---|---|---|
| sonnet-implementer A | T1 + T7 (migraciones 055/056) + T6 launch-check/env | migrations/, scripts/, .env*.example |
| sonnet-implementer B | T2 + T3 (boss config, poll tuning, retención webhooks) | src/shared/jobs/ |
| sonnet-implementer C | T4 drift test | tests/integration/schema-drift.test.ts |
| sonnet-implementer D | T5 canario | tests/integration/query-plan-canary.test.ts |
| sonnet-adversarial-reviewer | verificación fresca post-implementación | diff completo |

## REQUIERE INPUT (elevar al cierre, con evidencia)

1. **PITR**: RPO objetivo (¿cuántas horas de datos tolerás perder?) — add-on Supabase con costo mensual; hoy solo backups diarios.
2. **Retención `audit_logs`**: propuesta 24 meses (compliance Ley 25.326 + tamaño). ¿OK?
3. **Retención `notifications`**: propuesta 6 meses. ¿OK?
4. **Aplicar 055+056 a prod** tras gate verde.
