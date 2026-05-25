# Fase B10 — Observabilidad / Logs / Sentry — Report

**Fecha:** 2026-05-25
**Branch:** `audit/backend-b10`
**Veredicto:** 🟡 **4 P1 FIXED + 2 P2 FIXED + 1 P2 investigado** (0 P0)

**Objetivo (MASTER_PLAN):** Cuando rompa, saber qué/cuándo/dónde/por qué. Cerrar además arrastres P1 de fases previas (B2, B5) y P2 de B7/B9.

---

## Done-criteria (con evidencia)

| Criterio MASTER_PLAN | Estado | Evidencia |
|----------------------|--------|-----------|
| 0 `console.*` en `src/` | ✅ | grep `console\.(log\|warn\|error\|info\|debug)` sobre `src/` → **0 matches**. 16 archivos migrados (T3, `bbd5a4a`). |
| Logs JSON estructurados con `request_id` | ✅ | `logger.*` emite JSON single-line con `request_id`/`tenant_id`/`user_id`/`user_type` desde `AsyncLocalStorage`. 17 tests (T1, `335f256`). Propagación request_id en middleware + route-handler wrapper (T2, `79da674`). |
| Sentry con tag `tenant_id`/`user_id`/`release` | ✅ | `tagSession()` setea tags en `extractAuthUser` (T2). `release: VERCEL_GIT_COMMIT_SHA` ya presente en `sentry.server.config.ts`. |
| Health endpoint + monitor externo | ✅ endpoint / 📝 monitor | `/api/health` re-exporta `/api/status` (T8). Monitor externo (UptimeRobot/Better Uptime) → **Fase B11** (config de consola, fuera de código, ya marcado out-of-scope en el plan). |

---

## Hallazgos y disposición

### P1 (arrastres de fases previas) — todos FIXED

| ID | Hallazgo | Fix | Task / Commit |
|----|----------|-----|---------------|
| B5 | `send-email` double-dispatch bajo concurrencia (fix parcial en B5 dejaba la fila en `queued` durante el envío → re-claim tras crash post-send) | Estado `sending` añadido al enum `notification_status`. Claim atómico `queued→sending`; `markSent` exige `sending`; retry vuelve a `queued`; fallo final → `failed`. El sweep sólo toma `queued`, por lo que filas en vuelo (`sending`) no se re-despachan. | T5 / `64e6bb0` |
| B2 | `system_admins` sin audit trigger (escalada de privilegios sin trail) | Trigger `trg_system_admins_audit` AFTER INSERT/UPDATE/DELETE → `audit_logs` (`tenant_id=NULL`, `actor_type='system'`, `action='system_admin.<verb>'`). `SECURITY DEFINER` para bypass RLS en insert system-scoped. `mfa_secret` excluido de `changed_fields`. | T6 / `b31ee35` |
| B5 | DLQ / failed-jobs visibility ausente | `attachFailureHandlers(boss)` vía `boss.onComplete()` por cada cola → `Sentry.captureException` + `logger.error('job.failed')`. Cableado en el **worker process** (`registerAllWorkers`), no en `getBoss()`. | T7 / `1398a15` |
| B5 | queue depth monitor ausente | `GET /api/admin/jobs` (super-admin only) → profundidad de las 12 colas vía `getQueueSize()`. | T7 / `1398a15` |

### P2 — 2 FIXED, 1 investigado

| ID | Hallazgo | Disposición | Task |
|----|----------|-------------|------|
| B7 | Sentry init no degrada con DSN inválido (app crashea con `SENTRY_DSN=""`) | ✅ FIXED. `isValidDsn()` guard antes de `Sentry.init` en server/client/edge; DSN presente-pero-inválido emite warning, ausente → skip silencioso. | T4 / `669af9a` |
| B7 | MP retry on `InvalidTransitionError` ensucia Sentry (error de negocio, no bug) | ✅ FIXED. `beforeSend` filtra `InvalidTransitionError` por `name` (drop-list extensible, edge-safe). PII scrub B9 intacto. | T4 / `669af9a` |
| B9 | `race-abonado-vs-individual` flaky bajo orden específico de suite | 🔍 **INVESTIGADO**. Pasa **2/2 en aislamiento**; falla sólo en suite completa (`AbonadoConflictError` por estado residual de un test previo sobre la misma cancha+franja). Causa raíz: data bleed cross-test, no hermeticidad de fixtures. **No es regresión de B10** (B10 no toca lógica de abonados/bookings). Fix de hermeticidad recomendado (cleanup por-test de bookings/abonados, o cancha+slot únicos por test) → **deferido** (P2, no observabilidad, pre-existente). | — |

---

## Tareas ejecutadas (subagent-driven-development)

| Task | Descripción | Commit |
|------|-------------|--------|
| T1 | Logger JSON + request-context (AsyncLocalStorage) | `335f256` |
| T2 | Propagación request_id (middleware edge-safe) + Sentry session tags | `79da674` |
| T3 | Migración `console.*` → `logger.*` (16 archivos) | `bbd5a4a` |
| T4 | Sentry graceful DSN init + filtro `InvalidTransitionError` | `669af9a` |
| T5 | Estado `sending` (anti double-dispatch) | `64e6bb0` |
| T6 | Trigger de auditoría `system_admins` | `b31ee35` |
| T7 | DLQ failure alerts + `/api/admin/jobs` | `1398a15` |
| T8 | `/api/health` + report + STATE | (este commit) |

---

## Tests agregados

**Unit (6 archivos nuevos):**
- `tests/unit/logger.test.ts` (12) — JSON output, inyección de contexto, stderr vs stdout, omisión de campos sin contexto.
- `tests/unit/request-context.test.ts` (5) — aislamiento concurrente, propagación cross-await, no-op sin contexto.
- `tests/unit/observability-middleware.test.ts` (8) — `newRequestId`/`resolveRequestId` (clamp 64), `tagSession`.
- `tests/unit/sentry-graceful-init.test.ts` (6) — `isValidDsn` (vacío/malformed/sin key/https/http).
- `tests/unit/sentry-filter.test.ts` (4) — `isDroppableDomainError` (InvalidTransitionError real, Error genérico, undefined, no-error).
- `tests/unit/dlq-failure-handler.test.ts` (5) — failed → Sentry+log; success → no alerta.

**Integration (3 archivos nuevos):**
- `tests/integration/notification-sending-enum.test.ts` (4) — claim concurrente single-winner (**50 iter × 5 concurrentes**), markSent guard, retry path, fallo final.
- `tests/integration/system-admins-audit-trigger.test.ts` (4) — created/updated/deleted, `mfa_secret` no leakeado en `changed_fields`.
- `tests/integration/admin-jobs-endpoint.test.ts` (3) — anon 403, player 403, system_admin 200.

**Verificación final:**
- `pnpm typecheck` → limpio.
- `pnpm test` (unit) → **395 passed (39 files)**.
- `pnpm test:integration` → **320 passed, 1 flaky pre-existente** (`race-abonado-vs-individual`, pasa en aislamiento; ver P2 arriba).

---

## Migrations (test DB aplicadas + verificadas en vivo)

- `supabase/migrations/20260525000001_notification_sending_enum.sql` — `ADD VALUE 'sending'`. Verificado: enum = `queued,sending,sent,delivered,failed`.
- `supabase/migrations/20260525000002_system_admins_audit.sql` — `audit_logs.tenant_id DROP NOT NULL` + función + trigger. Verificado: `tenant_id` nullable=YES, trigger `trg_system_admins_audit` presente.

> Nota: schema Drizzle `audit-logs.ts` sincronizado (`tenantId` ahora `string | null`). `tenant_id = NULL` = fila system-scoped, invisible a queries tenant por la policy RLS SELECT existente (correcto by-design).

---

## Decisiones arquitectónicas (correcciones al plan)

1. **Edge-safety del request_id**: `newRequestId`/`resolveRequestId` movidos a `src/shared/lib/request-id.ts` (cero imports) para que `middleware.ts` (edge runtime) no arrastre `node:async_hooks` (`request-context.ts`) ni `@sentry/nextjs`.
2. **DLQ en worker process, no en `getBoss()`**: los handlers `onComplete` son pollers de larga vida; cablearlos en `getBoss()` los registraría en el proceso web serverless de vida corta. Movidos a `registerAllWorkers`.
3. **Auth del endpoint**: el plan asumía `resolveSession(req)` (inexistente); se usó `extractAuthUser()` (lee cookies, retorna `AuthUser` discriminado por `.type`).
4. **`ALL_QUEUES` = 12** (no 11): `expire-pending-booking.worker` registra también `expire-pending-booking-sweep`.

---

## Gaps remanentes / deferidos

| Item | Disposición |
|------|-------------|
| Uptime monitor externo (UptimeRobot/Better Uptime) | Fase B11 (config de consola) |
| Sentry alert rules / dashboard | Runbook (config de consola, no código) |
| Logger sink a Logtail/Axiom | Y2 si el volumen lo amerita (v1: stdout → Vercel Logs, per doc17) |
| `race-abonado-vs-individual` hermeticidad | Deferido (P2, pre-existente; fix de cleanup por-test recomendado) |
| Adopción de `runRequestObservability` en cada route handler | Capability construida; retrofit incremental fuera de scope B10 |

---

## Stats

- **Tasks:** 8/8 completadas.
- **Commits:** 7 de implementación + 1 de cierre.
- **Tests nuevos:** 40 unit + 11 integration = **51**.
- **Bugs fixed:** 4 P1 + 2 P2.
- **Archivos nuevos:** logger, request-context, request-id, observability middleware, sentry-event-filter, dlq, 2 migrations, /api/health, /api/admin/jobs.
- **Tests legacy ajustados:** 1 (`zod-coverage` allowlist: +admin/jobs, +health).
