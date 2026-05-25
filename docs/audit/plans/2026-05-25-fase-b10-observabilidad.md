# Fase B10 — Observabilidad / Logs / Sentry (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** Cerrar los gaps de observabilidad del MASTER_PLAN B10 + arrastres P1 de fases previas (B2 system_admins audit, B5 DLQ + queue depth + send-email `sending` enum, B7 Sentry DSN graceful + MP InvalidTransitionError filter). Resultado: cuando algo rompa, **sabés qué/cuándo/dónde/por qué** sin depender de que el cliente te avise.

**Architecture:** Logger JSON estructurado + request_id propagado por AsyncLocalStorage + Sentry tags (tenant_id/user_id/release). DLQ via `boss.onComplete()` + endpoint `/api/admin/jobs` para visibility. Migration aditiva `sending` para enum notification_status. Trigger DB que registra cambios sensibles en `system_admins` → `audit_logs` con `tenant_id = NULL` (system-scoped). Worktree `audit/backend-b10`.

**Tech Stack:** Vitest, Drizzle, pg-boss, postgres.js (sql template), Sentry SDK, AsyncLocalStorage (node:async_hooks), Next.js middleware.

---

## File Structure

**Crear:**
- `src/shared/lib/logger.ts` — logger JSON estructurado (info/warn/error/debug)
- `src/shared/lib/request-context.ts` — AsyncLocalStorage<{ requestId, tenantId, userId, userType }>
- `src/shared/middleware/observability.ts` — helper que set requestContext + Sentry.setTags
- `src/app/api/health/route.ts` — alias de `/api/status` (mantener ambos)
- `src/app/api/admin/jobs/route.ts` — queue depth + failed jobs visibility (super admin only)
- `src/shared/jobs/dlq.ts` — `attachFailureHandler(boss)` que emite Sentry + log structured
- `supabase/migrations/20260525000001_notification_sending_enum.sql` — añadir valor `sending`
- `supabase/migrations/20260525000002_system_admins_audit.sql` — trigger INSERT/UPDATE/DELETE → audit_logs
- `tests/unit/logger.test.ts`
- `tests/unit/request-context.test.ts`
- `tests/unit/sentry-graceful-init.test.ts`
- `tests/unit/dlq-failure-handler.test.ts`
- `tests/integration/notification-sending-enum.test.ts`
- `tests/integration/system-admins-audit-trigger.test.ts`
- `tests/integration/admin-jobs-endpoint.test.ts`
- `docs/audit/reports/fase-b10-observabilidad-report.md`
- `docs/audit/reports/fase-b10-raw/` — outputs

**Modificar:**
- `sentry.server.config.ts` — validar DSN antes de init, filtrar InvalidTransitionError, integrar request_id en scope
- `src/shared/db/schema/enums.ts` — añadir `sending` a `notificationStatusEnum`
- `src/modules/notifications/notification.service.ts` — `claimNotificationForSend` ahora `queued → sending`, `markNotificationSent` ahora `sending → sent`, transitions documentadas
- `src/shared/jobs/workers/send-email.worker.ts` — usar logger.* en vez de console.*
- `src/shared/jobs/workers/*.worker.ts` (16 archivos) — reemplazar console.* por logger.*
- `src/shared/jobs/boss.ts` — wire `attachFailureHandler(boss)` en `getBoss()`
- `src/shared/jobs/run-workers.ts` — usar logger.* en vez de console.*
- `src/app/api/webhooks/mercadopago/route.ts` — usar logger.*
- `src/app/api/auth/callback/route.ts` — usar logger.*
- `src/modules/bookings/booking.expiry.ts` — usar logger.*
- `middleware.ts` — set requestId + Sentry tags al inicio de cada request

**No tocar:**
- `src/lib/sentry.ts` (re-exports OK como están)
- `src/lib/sentry-pii-scrub.ts` (B9, ya verificado)
- Tests existentes salvo que un cambio de contrato lo requiera

---

## Task 1: Logger estructurado + request-context

**Goal:** Logger JSON en stdout con campos `timestamp, level, message, request_id, tenant_id, user_id, user_type` + AsyncLocalStorage para propagar contexto across async boundaries.

- [ ] **Step 1**: `src/shared/lib/request-context.ts`:
```typescript
import { AsyncLocalStorage } from 'node:async_hooks'

export type RequestContext = {
  requestId: string
  tenantId?: string
  userId?: string
  userType?: 'staff' | 'player' | 'system_admin' | 'system'
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

export function updateRequestContext(patch: Partial<RequestContext>): void {
  const current = storage.getStore()
  if (current) Object.assign(current, patch)
}
```

- [ ] **Step 2**: `src/shared/lib/logger.ts`:
```typescript
import { getRequestContext } from './request-context'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogMeta = Record<string, unknown>

function emit(level: LogLevel, message: string, meta?: LogMeta): void {
  const ctx = getRequestContext()
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(ctx?.requestId ? { request_id: ctx.requestId } : {}),
    ...(ctx?.tenantId ? { tenant_id: ctx.tenantId } : {}),
    ...(ctx?.userId ? { user_id: ctx.userId } : {}),
    ...(ctx?.userType ? { user_type: ctx.userType } : {}),
    ...(meta ?? {}),
  }
  const line = JSON.stringify(entry)
  if (level === 'error') process.stderr.write(line + '\n')
  else process.stdout.write(line + '\n')
}

export const logger = {
  debug: (msg: string, meta?: LogMeta) => emit('debug', msg, meta),
  info: (msg: string, meta?: LogMeta) => emit('info', msg, meta),
  warn: (msg: string, meta?: LogMeta) => emit('warn', msg, meta),
  error: (msg: string, meta?: LogMeta) => emit('error', msg, meta),
}
```

- [ ] **Step 3**: `tests/unit/request-context.test.ts` — verifica isolation entre runs concurrentes, propagación across `await`, `updateRequestContext` muta solo el contexto activo.

- [ ] **Step 4**: `tests/unit/logger.test.ts` — verifica:
  * Output es JSON parseable single-line
  * `request_id`/`tenant_id`/`user_id` se inyectan desde requestContext
  * `level: error` va a stderr, resto a stdout
  * meta keys no pisan campos reservados (last-write-wins documentado)
  * Sin requestContext, los campos contextuales se omiten

**Done:** Tests verdes (`pnpm test logger request-context`). Sin dependencias nuevas (AsyncLocalStorage es node built-in).

---

## Task 2: Middleware observability (request_id + Sentry tags)

**Goal:** Cada request HTTP entra a `runWithRequestContext` con `requestId = req.headers['x-request-id'] ?? nanoid(12)`. Sentry.setTag se llama con `tenant_id`/`user_id` cuando estén disponibles. Response carries `x-request-id` header for trace correlation.

- [ ] **Step 1**: `src/shared/middleware/observability.ts`:
```typescript
import * as Sentry from '@sentry/nextjs'
import { runWithRequestContext, updateRequestContext, type RequestContext } from '@/shared/lib/request-context'

export function newRequestId(): string {
  // nanoid-lite (alphanumeric 12 chars). Avoid extra dep; Math.random is fine
  // for trace correlation (non-cryptographic).
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 12; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

export function runRequestObservability<T>(
  req: Request,
  fn: () => Promise<T>,
): Promise<T> {
  const incoming = req.headers.get('x-request-id')
  const requestId = incoming && incoming.length <= 64 ? incoming : newRequestId()
  const ctx: RequestContext = { requestId }
  return runWithRequestContext(ctx, async () => {
    Sentry.setTag('request_id', requestId)
    return fn()
  })
}

export function tagSession(tenantId?: string, userId?: string, userType?: RequestContext['userType']): void {
  updateRequestContext({ tenantId, userId, userType })
  if (tenantId) Sentry.setTag('tenant_id', tenantId)
  if (userId) Sentry.setTag('user_id', userId)
  if (userType) Sentry.setTag('user_type', userType)
}
```

- [ ] **Step 2**: Integrar en `middleware.ts` (Next):
  * Generar requestId si falta + agregarlo a `request.headers` para downstream
  * Setear response header `x-request-id` antes de devolver
  * No envolver con `runWithRequestContext` (Next middleware runs on edge, AsyncLocalStorage no aplica; el wrap real ocurre en route handlers via `runRequestObservability`)

- [ ] **Step 3**: `src/modules/auth/auth.middleware.ts` — después de resolver el session user, llamar `tagSession(tenantId, userId, userType)`.

- [ ] **Step 4**: Tests:
  * `tests/unit/observability-middleware.test.ts` — `newRequestId` produce alfanumérico length 12, incoming `x-request-id` respeta (clamp 64), `tagSession` propaga al contexto.

**Done:** Middleware setea header, route handlers que usen `runRequestObservability` propagan ctx, Sentry tag visible en errores futuros.

---

## Task 3: Migrar console.log → logger.* (40 statements, 16 archivos)

**Goal:** Cero `console.log/warn/error` en `src/` (excepto si está explícitamente en `tests/` o `scripts/`).

- [ ] **Step 1**: Reemplazar en cada archivo:
  * `console.log('[X] msg')` → `logger.info('msg', { module: 'X' })` o `logger.info('msg', { ...structuredFields })`
  * `console.error('[X] error', err)` → `logger.error('msg', { module: 'X', error: err instanceof Error ? err.message : String(err) })`
  * `console.warn(...)` → `logger.warn(...)`

- [ ] **Step 2**: Archivos a migrar (lista del investigator):
  * `src/app/api/webhooks/mercadopago/route.ts:72`
  * `src/app/api/auth/callback/route.ts:32`
  * `src/modules/bookings/booking.expiry.ts:202`
  * `src/shared/jobs/run-workers.ts:12,15,24`
  * `src/shared/jobs/boss.ts:19`
  * `src/shared/jobs/workers/booking-reminder.worker.ts:88`
  * `src/shared/jobs/workers/auto-complete-bookings.worker.ts:13,22`
  * `src/shared/jobs/workers/dunning-retry.worker.ts:146-217`
  * `src/shared/jobs/workers/data-retention-cleanup.worker.ts:33,83,85,96`
  * `src/shared/jobs/workers/expire-pending-booking.worker.ts:36`
  * `src/shared/jobs/workers/expire-trials.worker.ts:29,39`
  * `src/shared/jobs/workers/generate-abonado-slots.worker.ts:111,121`
  * `src/shared/jobs/workers/process-mp-webhook.worker.ts:28`
  * `src/shared/jobs/workers/reconcile-pending-payments.worker.ts:79,87,99`
  * `src/shared/jobs/workers/refresh-mp-tokens.worker.ts:27,32,42`
  * `src/shared/jobs/workers/send-email.worker.ts:49,52,97`

- [ ] **Step 3**: Verificar con grep que `console.` ya no aparece en `src/`:
```bash
grep -rn "console\.\(log\|warn\|error\)" src/ --include="*.ts" --include="*.tsx" | grep -v "src/lib/sentry" || echo "CLEAN"
```

- [ ] **Step 4**: `pnpm typecheck` debe pasar.

**Done:** Comando grep devuelve `CLEAN`. Typecheck verde.

---

## Task 4: Sentry init graceful degrade + InvalidTransitionError filter

**Goal:** Si `SENTRY_DSN` está vacío o malformado, Sentry no inicializa (skip silencioso) + log warning estructurado. `InvalidTransitionError` (estado de negocio, no bug) no llega a Sentry — se filtra por `beforeSend`.

- [ ] **Step 1**: Modificar `sentry.server.config.ts`:
```typescript
function isValidDsn(dsn: string | undefined): dsn is string {
  if (!dsn) return false
  try {
    const u = new URL(dsn)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.username.length > 0
  } catch { return false }
}

const dsn = process.env.SENTRY_DSN
if (!isValidDsn(dsn)) {
  if (dsn) {
    // Don't import logger here (top-level side effect; logger needs AsyncLocalStorage).
    // Emit a plain stderr line so ops sees the misconfig once.
    process.stderr.write(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: 'Sentry DSN invalid, skipping init',
    }) + '\n')
  }
} else {
  Sentry.init({
    dsn,
    // ... existing config
    beforeSend(event, hint) {
      const orig = hint?.originalException
      // Filter InvalidTransitionError — domain-level, not a bug to alert on.
      if (orig instanceof Error && orig.name === 'InvalidTransitionError') return null
      // ... rest of existing beforeSend (PII scrub)
    },
  })
}
```

- [ ] **Step 2**: Mismo patrón en `sentry.client.config.ts` y `sentry.edge.config.ts`.

- [ ] **Step 3**: Asegurar que `InvalidTransitionError` setea `this.name = 'InvalidTransitionError'` en constructor (verificar `src/modules/billing/billing.errors.ts`).

- [ ] **Step 4**: Tests:
  * `tests/unit/sentry-graceful-init.test.ts` — `isValidDsn` casos: vacío, malformed, sin user, OK https, OK http.
  * `tests/unit/sentry-filter.test.ts` — `beforeSend` retorna `null` cuando `hint.originalException.name === 'InvalidTransitionError'`.

**Done:** Tests verdes. App arranca con `SENTRY_DSN=""` sin crashear.

---

## Task 5: send-email `sending` enum migration + state machine

**Goal:** Cerrar el race condition restante de B5: `queued → sending → sent` (en lugar de `queued → sent` con flag implícito de `attempt_count`). Atómico: `UPDATE … SET status = 'sending' WHERE status = 'queued'`.

- [ ] **Step 1**: Migration aditiva — no romper datos existentes:
```sql
-- supabase/migrations/20260525000001_notification_sending_enum.sql
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'sending' AFTER 'queued';
COMMENT ON TYPE notification_status IS
  'Lifecycle: queued → sending → sent | delivered | failed. `sending` claim prevents double-dispatch under sweep races (B5/B10).';
```

- [ ] **Step 2**: Actualizar `notificationStatusEnum` en `src/shared/db/schema/enums.ts`:
```typescript
export const notificationStatusEnum = pgEnum('notification_status', [
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed',
])
```

- [ ] **Step 3**: Actualizar `claimNotificationForSend` en `src/modules/notifications/notification.service.ts`:
```typescript
export async function claimNotificationForSend(id: string, expectedAttemptCount: number): Promise<boolean> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    UPDATE notifications
    SET status = 'sending', attempt_count = attempt_count + 1
    WHERE id = ${id}
      AND status = 'queued'
      AND attempt_count = ${expectedAttemptCount}
    RETURNING id
  `
  return rows.length > 0
}
```

- [ ] **Step 4**: Actualizar `markNotificationSent` para exigir `status = 'sending'`:
```typescript
export async function markNotificationSent(id: string): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE notifications
    SET status = 'sent', sent_at = NOW()
    WHERE id = ${id} AND status = 'sending'
  `
}
```

- [ ] **Step 5**: Actualizar `markNotificationFailed` (debe aceptar `sending` y `queued` como pre-states; fallar desde `queued` ocurre si claim falla antes del send):
```typescript
export async function markNotificationFailed(id: string, error: string): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE notifications
    SET status = 'failed', last_error = ${error}
    WHERE id = ${id} AND status IN ('queued', 'sending')
  `
}
```

- [ ] **Step 6**: Actualizar `updateNotificationLastError` para devolver al estado `queued` (retry path):
```typescript
export async function updateNotificationLastError(id: string, error: string, newAttemptCount: number): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE notifications
    SET status = 'queued', last_error = ${error}, attempt_count = ${newAttemptCount}
    WHERE id = ${id} AND status = 'sending'
  `
}
```

- [ ] **Step 7**: Tests integration:
  * `tests/integration/notification-sending-enum.test.ts`:
    - Concurrent claims: 5 workers race el mismo row, sólo 1 gana
    - Worker crash mid-send: row queda en `sending`, próximo sweep no la toma (estamos cubiertos por orden ORDER BY queued_at en sweep; status `sending` no matchea WHERE)
    - Retry path: failed attempt → row vuelve a `queued`, attempt_count++
    - Final failure (attempt 3): row → `failed`

- [ ] **Step 8**: Verificar que el sweep query (`processQueuedNotifications`) sigue siendo correcto:
```sql
SELECT id FROM notifications WHERE status = 'queued' AND attempt_count <= 3 ORDER BY queued_at LIMIT 50
```
(no incluye `sending`, OK)

**Done:** Tests verdes incluyendo race 100 iteraciones. Migration aplicable + reversible (rollback documentado: no se puede `DROP VALUE`, pero se puede `UPDATE notifications SET status='queued' WHERE status='sending'`).

---

## Task 6: system_admins audit trigger

**Goal:** Cualquier INSERT/UPDATE/DELETE en `system_admins` queda registrado en `audit_logs` con `tenant_id = NULL`, `actor_type = 'system'`, `action = 'system_admin.<verb>'`. Defiende contra escalada de privilegios sin trail.

- [ ] **Step 1**: Migration:
```sql
-- supabase/migrations/20260525000002_system_admins_audit.sql
CREATE OR REPLACE FUNCTION audit_system_admins_change()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_resource_id UUID;
  v_metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'system_admin.created';
    v_resource_id := NEW.id;
    v_metadata := jsonb_build_object('email', NEW.email, 'status', NEW.status);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'system_admin.updated';
    v_resource_id := NEW.id;
    v_metadata := jsonb_build_object(
      'changed_fields', (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each(to_jsonb(NEW))
        WHERE to_jsonb(NEW) ->> key IS DISTINCT FROM to_jsonb(OLD) ->> key
          AND key NOT IN ('updated_at', 'mfa_secret')
      ),
      'status_was', OLD.status,
      'status_now', NEW.status
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'system_admin.deleted';
    v_resource_id := OLD.id;
    v_metadata := jsonb_build_object('email', OLD.email);
  END IF;

  INSERT INTO audit_logs (tenant_id, actor_id, actor_type, action, resource_type, resource_id, metadata, created_at)
  VALUES (
    NULL,
    COALESCE(NULLIF(current_setting('app.current_system_admin_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
    'system',
    v_action,
    'system_admin',
    v_resource_id,
    v_metadata,
    NOW()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_system_admins_audit
AFTER INSERT OR UPDATE OR DELETE ON system_admins
FOR EACH ROW EXECUTE FUNCTION audit_system_admins_change();
```

- [ ] **Step 2**: Verificar que `audit_logs.tenant_id` admite NULL. Si no, requiere ALTER COLUMN. Si la policy RLS requiere tenant_id NOT NULL via constraint, ajustar (NULL = system-scoped).

- [ ] **Step 3**: Si RLS INSERT en audit_logs bloquea writes con `tenant_id IS NULL`, agregar policy `system_admin_audit_insert` o usar SECURITY DEFINER + role bypass como el trigger ya hace (función corre con privilegios del owner).

- [ ] **Step 4**: Tests integration:
  * `tests/integration/system-admins-audit-trigger.test.ts`:
    - INSERT system_admin → audit_logs row con action='system_admin.created', tenant_id IS NULL
    - UPDATE status → metadata.changed_fields incluye 'status', 'status_was', 'status_now'
    - UPDATE mfa_secret → metadata.changed_fields NO incluye mfa_secret (sensitive scrubbed)
    - DELETE → audit_logs row con action='system_admin.deleted'

**Done:** Trigger creado + 4 tests verdes.

---

## Task 7: DLQ failure handler + queue depth endpoint

**Goal:** Visibility sobre jobs fallados (DLQ) y profundidad de colas. Cada job que excede retryLimit dispara Sentry + log estructurado. Endpoint `/api/admin/jobs` expone queue size + failed count para dashboards.

- [ ] **Step 1**: `src/shared/jobs/dlq.ts`:
```typescript
import type PgBoss from 'pg-boss'
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/shared/lib/logger'

const QUEUES = [
  'send-email',
  'expire-pending-booking',
  'auto-complete-bookings',
  'booking-reminder',
  'process-mp-webhook',
  'refresh-mp-tokens',
  'reconcile-pending-payments',
  'dunning-retry',
  'data-retention-cleanup',
  'expire-trials',
  'generate-abonado-slots',
] as const

export function attachFailureHandlers(boss: PgBoss): void {
  for (const queue of QUEUES) {
    boss.onComplete(queue, (job) => {
      // pg-boss v9 emits onComplete with output { failed: bool, ... }
      const data = job.data as { failed?: boolean; message?: string; state?: string } | undefined
      if (data?.failed) {
        const err = new Error(`Job ${queue} failed: ${data.message ?? 'unknown'}`)
        Sentry.captureException(err, { tags: { queue, job_id: job.id } })
        logger.error('job.failed', { queue, job_id: job.id, message: data.message })
      }
    }).catch((err) => {
      logger.warn('dlq.onComplete.subscribe_failed', { queue, error: err instanceof Error ? err.message : String(err) })
    })
  }
}
```

- [ ] **Step 2**: Llamar `attachFailureHandlers(boss)` en `getBoss()` tras `await boss.start()`.

- [ ] **Step 3**: `src/app/api/admin/jobs/route.ts` — super admin only:
```typescript
import { getBoss } from '@/shared/jobs/boss'
import { resolveSession } from '@/modules/auth/auth.middleware'

const QUEUES = [/* same list */] as const

export async function GET(req: Request): Promise<Response> {
  const session = await resolveSession(req)
  if (!session || session.type !== 'system_admin') {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }
  const boss = await getBoss()
  const queues = await Promise.all(QUEUES.map(async (q) => {
    try {
      const size = await boss.getQueueSize(q)
      return { queue: q, depth: size }
    } catch {
      return { queue: q, depth: null, error: 'unavailable' }
    }
  }))
  return Response.json({ queues, timestamp: new Date().toISOString() })
}
```

- [ ] **Step 4**: Tests:
  * `tests/unit/dlq-failure-handler.test.ts` — mock boss + verify Sentry.captureException llamado en onComplete con `data.failed = true`.
  * `tests/integration/admin-jobs-endpoint.test.ts` — anon → 403, player → 403, system_admin → 200 con `queues[]`.

**Done:** Endpoint funcional + DLQ emite alertas + 2 tests verdes.

---

## Task 8: /api/health endpoint + report B10

**Goal:** Endpoint `/api/health` que retorna el mismo payload que `/api/status` (sin auth, idempotente) + documentar uptime monitor externo. Cerrar tarea generando report.

- [ ] **Step 1**: `src/app/api/health/route.ts`:
```typescript
export { GET, dynamic, runtime } from '../status/route'
```
(re-export del módulo `/api/status` — mismo contrato, diferente path. Doc19 y doc17 referencian `/api/health`.)

- [ ] **Step 2**: Verificar que `tracesSampler` en `sentry.server.config.ts` ya excluye `/api/health` (sí — investigator confirmó línea 10).

- [ ] **Step 3**: `docs/audit/reports/fase-b10-observabilidad-report.md`:
  * Tabla done-criteria con evidencia (test names + commit SHA)
  * Hallazgos P0/P1/P2 con su disposición
  * Tests agregados (count)
  * Gaps remanentes con disposición (e.g., uptime monitor externo se configura en Fase B11)
  * Stats: archivos modificados, líneas, tests pasando

- [ ] **Step 4**: Actualizar `docs/audit/STATE.md`:
  * B10 → completed
  * Mover items P1 resueltos de "P1 (alto)" a "✅ FIXED"
  * Próxima fase: B11

**Done:** `/api/health` 200 con health payload. Report generado. STATE.md actualizado.

---

## Verification

- [ ] `pnpm typecheck` verde
- [ ] `pnpm test` verde (tests unit nuevos + no regression)
- [ ] `pnpm test:integration` verde (sending enum, system_admins audit, admin-jobs)
- [ ] `grep -rn "console\.\(log\|warn\|error\)" src/ --include="*.ts" --include="*.tsx" | grep -v "src/lib/sentry"` devuelve vacío
- [ ] `/api/health` y `/api/status` ambos responden 200 en local
- [ ] Sentry env vacío no crashea app
- [ ] Race test send-email 100 iters: 0 duplicates

## Out-of-scope (deferred)

- Configurar UptimeRobot / Better Uptime externo (Fase B11 launch-checklist)
- Dashboard Sentry alert rules (config en consola, no en código — runbook)
- Logger sink to Logtail/Axiom (Y2 si volumen lo amerita; v1 stdout → Vercel Logs es suficiente per doc17)
- Tracing distributing (Sentry Performance ya cubre 10% sampling, OK v1)
- Métricas custom counters (Prometheus, Sentry custom metrics) — postpone Y1
