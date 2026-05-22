# Fase 4 — Testing E2E + Stress + Launch: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Spec: `docs/superpowers/specs/2026-05-22-fase-4-testing-launch-design.md`.

**Goal:** Cerrar el último escalón antes de producción: suite E2E Playwright (4 specs), stress test HTTP de concurrencia (50 reservas paralelas → invariante "1 confirmada"), observabilidad con Sentry breadcrumbs típados, `/api/status` real (DB + pg-boss + externos), y un `launch-check` ejecutable + `LAUNCH.md` manual.

**Architecture:** 3 milestones (M1 observability + status, M2 E2E suite, M3 stress + launch) en una sola rama, commits separados. Asume fase-3 (rate-limit Upstash) mergeado; E2E acomoda con `UPSTASH_REDIS_REST_URL=''` (fail-open en `publicAvailability`). Endpoint `/api/__e2e__/*` triple-guarded para stress test.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Vitest (unit), Playwright (E2E), `@sentry/nextjs`, pg-boss, postgres.js, Supabase local.

**Conventions (CLAUDE.md):**
- `pnpm typecheck` después de cada cambio.
- Conventional commits: `feat(observability):`, `test(e2e):`, `chore(launch):`.
- ENUMs `canceled` (una L), nunca `cancelled`.
- Montos en centavos (integer).
- Sin `any`; tipos estrictos.

---

## File Structure

**[NEW]**
- `src/shared/observability/breadcrumbs.ts` — helper típado Sentry
- `src/shared/observability/index.ts` — re-export
- `tests/unit/breadcrumbs.test.ts`
- `tests/unit/api-status.test.ts`
- `src/app/api/__e2e__/create-booking/route.ts` — endpoint guarded
- `tests/e2e/global-setup.ts`
- `tests/e2e/global-teardown.ts`
- `tests/e2e/fixtures.ts`
- `tests/e2e/landing.spec.ts`
- `tests/e2e/portal-search.spec.ts`
- `tests/e2e/availability.spec.ts`
- `tests/e2e/admin-login.spec.ts`
- `scripts/seed-e2e.ts`
- `scripts/stress-test.ts`
- `scripts/launch-check.ts`
- `docs/LAUNCH.md`

**[MODIFY]**
- `src/app/api/status/route.ts` — DB + pg-boss reales
- `playwright.config.ts` — globalSetup + webServer healthcheck
- `package.json` — scripts E2E + stress + launch
- `.env.test.example` — vars E2E + UPSTASH vacío
- `src/modules/bookings/booking.service.ts` — instrumentación
- `src/modules/bookings/booking.concurrency.ts` — instrumentación
- `src/modules/bookings/booking.cancellation.ts` — instrumentación
- `src/modules/payments/payment.service.ts` — instrumentación
- `src/modules/payments/mp-webhook.handler.ts` — instrumentación
- `src/app/api/webhooks/mercadopago/route.ts` — instrumentación
- `src/shared/jobs/workers/process-mp-webhook.worker.ts` — instrumentación
- `src/modules/billing/billing.service.ts` — instrumentación (SaaS upgrade)

**[DELETE]**
- `tests/e2e/.gitkeep`

---

## Phase 0 — Setup

### Task 0.1: Create feature branch + baseline check

**Files:** none (verification only)

- [ ] **Step 1: Create branch**

```bash
git checkout -b fase-4-testing-launch
```
Expected: switched to a new branch.

- [ ] **Step 2: Baseline gate**

```bash
pnpm typecheck && pnpm lint && pnpm test
```
Expected: all PASS. Record any pre-existing failures (the meta-tests from fase-3 should be green if fase-3 está mergeado; si no, anotalo y continuá).

- [ ] **Step 3: Verify Supabase local is up + DB reachable**

```bash
pnpm supabase:start
node -e "console.log(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres')"
```
Expected: Supabase prints "Started supabase local development setup."

- [ ] **Step 4: Install Playwright browsers (one-time per machine)**

```bash
pnpm exec playwright install --with-deps chromium
```
Expected: chromium downloaded; no errors.

---

## Phase 1 — M1: Observability + /api/status

### Task 1.1: Typed breadcrumb helper + unit test

**Files:**
- Create: `src/shared/observability/breadcrumbs.ts`
- Create: `src/shared/observability/index.ts`
- Test: `tests/unit/breadcrumbs.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/breadcrumbs.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

const addBreadcrumb = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: (args: unknown) => addBreadcrumb(args),
}))

import { track } from '@/shared/observability/breadcrumbs'

beforeEach(() => {
  addBreadcrumb.mockClear()
})

describe('track.booking', () => {
  it('emits breadcrumb with category=booking and given event as message', () => {
    track.booking('booking.online.create.start', {
      tenantId: 'tenant-1',
      courtId: 'court-1',
      playerId: 'player-1',
    })
    expect(addBreadcrumb).toHaveBeenCalledTimes(1)
    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'booking',
      message: 'booking.online.create.start',
      data: { tenantId: 'tenant-1', courtId: 'court-1', playerId: 'player-1' },
      level: 'info',
    })
  })
})

describe('track.payment', () => {
  it('emits breadcrumb with category=payment', () => {
    track.payment('payment.deposit.approved', {
      paymentId: 'p-1',
      mpPaymentId: '12345',
      amountCents: 100000,
    })
    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'payment',
      message: 'payment.deposit.approved',
      data: { paymentId: 'p-1', mpPaymentId: '12345', amountCents: 100000 },
      level: 'info',
    })
  })
})

describe('track.webhook', () => {
  it('emits breadcrumb with category=webhook', () => {
    track.webhook('mp.webhook.received', {
      mpEventId: 'evt-1',
      eventType: 'payment',
    })
    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'webhook',
      message: 'mp.webhook.received',
      data: { mpEventId: 'evt-1', eventType: 'payment' },
      level: 'info',
    })
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run tests/unit/breadcrumbs.test.ts
```
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement breadcrumbs helper**

Create `src/shared/observability/breadcrumbs.ts`:

```ts
import * as Sentry from '@sentry/nextjs'

type BookingEvent =
  | 'booking.online.create.start'
  | 'booking.online.create.success'
  | 'booking.online.create.slot_taken'
  | 'booking.manual.create.success'
  | 'booking.transition.confirmed'
  | 'booking.transition.expired'
  | 'booking.cancel.by_player'
  | 'booking.cancel.by_admin'

type PaymentEvent =
  | 'payment.deposit.create'
  | 'payment.deposit.approved'
  | 'payment.deposit.rejected'
  | 'payment.saas.upgrade.approved'

type WebhookEvent =
  | 'mp.webhook.received'
  | 'mp.webhook.duplicate'
  | 'mp.webhook.processed'
  | 'mp.webhook.failed'

type BookingCtx = {
  bookingId?: string
  tenantId?: string
  courtId?: string
  playerId?: string
}

type PaymentCtx = {
  paymentId?: string
  bookingId?: string
  tenantId?: string
  mpPaymentId?: string
  amountCents?: number
}

type WebhookCtx = {
  mpEventId?: string
  tenantId?: string
  eventType?: string
  mpPaymentId?: string
}

function emit(category: string, message: string, data: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ category, message, data, level: 'info' })
}

export const track = {
  booking: (ev: BookingEvent, ctx: BookingCtx) => emit('booking', ev, ctx),
  payment: (ev: PaymentEvent, ctx: PaymentCtx) => emit('payment', ev, ctx),
  webhook: (ev: WebhookEvent, ctx: WebhookCtx) => emit('webhook', ev, ctx),
}
```

Create `src/shared/observability/index.ts`:

```ts
export { track } from './breadcrumbs'
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm vitest run tests/unit/breadcrumbs.test.ts && pnpm typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/observability/ tests/unit/breadcrumbs.test.ts
git commit -m "feat(observability): add typed Sentry breadcrumb helper"
```

---

### Task 1.2: Instrument `booking.service.ts`

**Files:**
- Modify: `src/modules/bookings/booking.service.ts`

- [ ] **Step 1: Add the import**

Open `src/modules/bookings/booking.service.ts`. Find the existing import block at the top (around lines 1-33). Add at the end of the import block:

```ts
import { track } from '@/shared/observability'
```

- [ ] **Step 2: Instrument `createOnlineBooking` entry**

Locate the function `createOnlineBooking`. Inside the outer function body (before any DB call), add as the **first line of the function body**:

```ts
  track.booking('booking.online.create.start', {
    tenantId: input.tenantId,
    courtId: input.courtId,
    playerId: input.playerId,
  })
```

(Adjust the property names to match the actual `input` shape. Read the function signature first; if a field is named differently, use the actual name.)

- [ ] **Step 3: Instrument `createOnlineBooking` success path**

In the same function, find the `return` statement that returns the created booking. Immediately **before** that `return`, add:

```ts
  track.booking('booking.online.create.success', {
    bookingId: created.id,
    tenantId: created.tenantId,
    courtId: created.courtId,
    playerId: created.playerId ?? undefined,
  })
```

(Use the actual variable name in scope for the created booking row. If it's `row` or `bookingRow`, use that instead of `created`.)

- [ ] **Step 4: Instrument the exclusion-violation catch**

Find the `isExclusionViolation` catch path in `createOnlineBooking` (or the wrapper that handles `PG_EXCLUSION_VIOLATION`). Right before the `throw new SlotTakenError(...)`, add:

```ts
  track.booking('booking.online.create.slot_taken', {
    tenantId: input.tenantId,
    courtId: input.courtId,
    playerId: input.playerId,
  })
```

- [ ] **Step 5: Instrument `createManualBooking` success path**

Locate `createManualBooking`. Right before its successful `return`, add:

```ts
  track.booking('booking.manual.create.success', {
    bookingId: created.id,
    tenantId: created.tenantId,
    courtId: created.courtId,
    playerId: created.playerId ?? undefined,
  })
```

- [ ] **Step 6: Typecheck + run unit tests**

```bash
pnpm typecheck && pnpm test
```
Expected: PASS. If a type error appears (mismatch between the local variable name and what's actually returned), fix the property name to match what the function returns, then re-run.

- [ ] **Step 7: Commit**

```bash
git add src/modules/bookings/booking.service.ts
git commit -m "feat(observability): instrument booking.service with breadcrumbs"
```

---

### Task 1.3: Instrument `booking.concurrency.ts` and `booking.cancellation.ts`

**Files:**
- Modify: `src/modules/bookings/booking.concurrency.ts`
- Modify: `src/modules/bookings/booking.cancellation.ts`

- [ ] **Step 1: Instrument `transitionFromPendingPayment`**

Open `src/modules/bookings/booking.concurrency.ts`. Add the import at the top:

```ts
import { track } from '@/shared/observability'
```

In `transitionFromPendingPayment`, after the `rows.length === 0` early return and **before** the final `return { won: true, row: ... }`, add:

```ts
  if (newStatus === 'confirmed') {
    track.booking('booking.transition.confirmed', {
      bookingId,
    })
  } else {
    track.booking('booking.transition.expired', {
      bookingId,
    })
  }
```

- [ ] **Step 2: Instrument cancellation paths**

Open `src/modules/bookings/booking.cancellation.ts`. Add the import:

```ts
import { track } from '@/shared/observability'
```

Find `cancelByPlayer` (or whatever the player-cancel function is called). At the **start** of the function body, add:

```ts
  track.booking('booking.cancel.by_player', {
    bookingId,
    playerId,
  })
```

Find `cancelByAdmin` (or the equivalent admin-cancel function). At the start, add:

```ts
  track.booking('booking.cancel.by_admin', {
    bookingId,
    tenantId,
  })
```

(If the parameter names differ, use the actual names from the function signature. The point is: log the IDs available in scope at entry.)

- [ ] **Step 3: Typecheck + unit tests**

```bash
pnpm typecheck && pnpm test
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/bookings/booking.concurrency.ts src/modules/bookings/booking.cancellation.ts
git commit -m "feat(observability): instrument booking transitions and cancellations"
```

---

### Task 1.4: Instrument `payment.service.ts` and `billing.service.ts`

**Files:**
- Modify: `src/modules/payments/payment.service.ts`
- Modify: `src/modules/billing/billing.service.ts`

- [ ] **Step 1: Add import to payment.service.ts**

Open `src/modules/payments/payment.service.ts`. Add at the top of imports:

```ts
import { track } from '@/shared/observability'
```

- [ ] **Step 2: Instrument `createDepositPayment`**

In `createDepositPayment`, **before** any DB call (so right after `bookingId` is in scope), add:

```ts
  track.payment('payment.deposit.create', {
    bookingId,
  })
```

- [ ] **Step 3: Instrument `dispatchPaymentInfo`**

Find `dispatchPaymentInfo`. After the switch/if that branches on `info.status`, add:

- In the `approved` branch (or wherever the booking is transitioned to `confirmed`), add **before** the side-effects:

```ts
  track.payment('payment.deposit.approved', {
    paymentId: payment.id,
    bookingId: payment.bookingId,
    tenantId: payment.tenantId,
    mpPaymentId: info.id,
    amountCents: info.transactionAmountCents ?? undefined,
  })
```

- In the `rejected` / `cancelled` branch, add:

```ts
  track.payment('payment.deposit.rejected', {
    paymentId: payment.id,
    bookingId: payment.bookingId,
    tenantId: payment.tenantId,
    mpPaymentId: info.id,
  })
```

(Use the actual variable names in scope. If `payment` is called `paymentRow` or similar, use the local name.)

- [ ] **Step 4: Instrument `lockMpEvent` duplicate path**

In `lockMpEvent`, after the `ON CONFLICT DO NOTHING` insert, when the rowcount indicates **duplicate** (no row inserted), add:

```ts
  track.webhook('mp.webhook.duplicate', {
    mpEventId,
    tenantId,
    eventType,
  })
```

(Place this inside the branch that handles duplicates — typically `if (rows.length === 0)` or equivalent.)

- [ ] **Step 5: Instrument billing.service.ts (SaaS upgrade)**

Open `src/modules/billing/billing.service.ts`. Add the import:

```ts
import { track } from '@/shared/observability'
```

Find `handleUpgradeApproved` (or whatever the function is called per the spec). At the start of the function body, add:

```ts
  track.payment('payment.saas.upgrade.approved', {
    tenantId,
  })
```

(If the parameter name is `tenant` or `tenantId`, use the actual name.)

- [ ] **Step 6: Typecheck + unit tests**

```bash
pnpm typecheck && pnpm test
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/payments/payment.service.ts src/modules/billing/billing.service.ts
git commit -m "feat(observability): instrument payment + billing breadcrumbs"
```

---

### Task 1.5: Instrument MP webhook route, handler, worker

**Files:**
- Modify: `src/app/api/webhooks/mercadopago/route.ts`
- Modify: `src/modules/payments/mp-webhook.handler.ts`
- Modify: `src/shared/jobs/workers/process-mp-webhook.worker.ts`

- [ ] **Step 1: Instrument webhook route (post-parse)**

Open `src/app/api/webhooks/mercadopago/route.ts`. Add the import after existing imports:

```ts
import { track } from '@/shared/observability'
```

Right **after** the `webhookPayloadSchema.safeParse(body)` succeeds and **before** the `HANDLED_TYPES` check, add:

```ts
  track.webhook('mp.webhook.received', {
    mpEventId: payload.id,
    tenantId,
    eventType: payload.type,
    mpPaymentId: payload.data.id,
  })
```

- [ ] **Step 2: Instrument handler success path**

Open `src/modules/payments/mp-webhook.handler.ts`. Add the import:

```ts
import { track } from '@/shared/observability'
```

At the **end** of `handleMpWebhookJob` (just before the function returns normally, after all dispatch branches), add:

```ts
  track.webhook('mp.webhook.processed', {
    mpEventId: job.mpEventId,
    tenantId: job.tenantId,
    eventType: job.eventType,
    mpPaymentId: job.mpPaymentId,
  })
```

If the function has multiple return paths (early returns from each branch), add the call inside each branch right before the `return`. Alternative: wrap the body in `try { ... } finally { track.webhook(...) }` if cleaner.

- [ ] **Step 3: Instrument worker catch**

Open `src/shared/jobs/workers/process-mp-webhook.worker.ts`. Add the import:

```ts
import { track } from '@/shared/observability'
```

Find the worker handler function and the `try/catch` (or the place where `handleMpWebhookJob` is awaited). In the `catch` block, add as the first line:

```ts
    track.webhook('mp.webhook.failed', {
      mpEventId: job.data?.mpEventId,
      tenantId: job.data?.tenantId,
      eventType: job.data?.eventType,
    })
```

(Adjust to the actual job shape — pg-boss wraps payloads in `job.data` typically.)

- [ ] **Step 4: Typecheck + unit tests**

```bash
pnpm typecheck && pnpm test
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/mercadopago/route.ts src/modules/payments/mp-webhook.handler.ts src/shared/jobs/workers/process-mp-webhook.worker.ts
git commit -m "feat(observability): instrument MP webhook route, handler, worker"
```

---

### Task 1.6: Real `/api/status` with DB + pg-boss + privilege mitigation

**Files:**
- Modify: `src/app/api/status/route.ts`
- Test: `tests/unit/api-status.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/api-status.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mocks must be declared before importing the route module.
vi.mock('@/shared/db/client', () => ({
  getSql: vi.fn(),
}))
vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(),
}))

import { GET } from '@/app/api/status/route'
import { getSql } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MP_CLIENT_ID = 'set'
  process.env.MP_CLIENT_SECRET = 'set'
  process.env.RESEND_API_KEY = 'set'
  process.env.SENTRY_DSN = 'set'
})

describe('GET /api/status', () => {
  it('returns 200 + status=ok when all checks pass', async () => {
    const sqlMock = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlMock)
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      getQueueSize: vi.fn().mockResolvedValue(0),
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    const db = body.checks.find((c: { name: string }) => c.name === 'database')
    expect(db.status).toBe('ok')
    const pgboss = body.checks.find((c: { name: string }) => c.name === 'pg-boss')
    expect(pgboss.status).toBe('ok')
  })

  it('returns 503 + status=down when DB throws', async () => {
    const sqlMock = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'))
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlMock)
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      getQueueSize: vi.fn().mockResolvedValue(0),
    })

    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('down')
    const db = body.checks.find((c: { name: string }) => c.name === 'database')
    expect(db.status).toBe('down')
  })

  it('degrades pg-boss to "ok" on permission denied', async () => {
    const sqlMock = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlMock)
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      getQueueSize: vi.fn().mockRejectedValue(new Error('permission denied for schema pgboss')),
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    const pgboss = body.checks.find((c: { name: string }) => c.name === 'pg-boss')
    expect(pgboss.status).toBe('ok')
  })

  it('reports pg-boss down on real connection error', async () => {
    const sqlMock = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlMock)
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Connection terminated unexpectedly'),
    )

    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    const pgboss = body.checks.find((c: { name: string }) => c.name === 'pg-boss')
    expect(pgboss.status).toBe('down')
  })

  it('reports externals as down when env vars missing', async () => {
    delete process.env.MP_CLIENT_ID
    const sqlMock = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlMock)
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      getQueueSize: vi.fn().mockResolvedValue(0),
    })

    const res = await GET()
    const body = await res.json()
    const mp = body.checks.find((c: { name: string }) => c.name === 'mercadopago')
    expect(mp.status).toBe('down')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run tests/unit/api-status.test.ts
```
Expected: FAIL — current `/api/status` returns the stub object, no `checks` field.

- [ ] **Step 3: Implement the real route**

Replace `src/app/api/status/route.ts` with:

```ts
import { getSql } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type CheckStatus = 'ok' | 'degraded' | 'down'

type Check = {
  name: string
  status: CheckStatus
  latencyMs?: number
  error?: string
}

async function checkDb(): Promise<Check> {
  const t0 = Date.now()
  try {
    const sql = getSql()
    await sql`SELECT 1`
    return { name: 'database', status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    return { name: 'database', status: 'down', error: (err as Error).message }
  }
}

async function checkPgBoss(): Promise<Check> {
  const t0 = Date.now()
  try {
    const boss = await getBoss()
    try {
      await boss.getQueueSize('send-email')
    } catch (innerErr) {
      const msg = String((innerErr as Error).message ?? innerErr).toLowerCase()
      if (msg.includes('permission denied') || msg.includes('does not exist')) {
        // Pool alive; role lacks introspection privilege — that's by design in prod.
        return { name: 'pg-boss', status: 'ok', latencyMs: Date.now() - t0 }
      }
      throw innerErr
    }
    return { name: 'pg-boss', status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    return { name: 'pg-boss', status: 'down', error: (err as Error).message }
  }
}

function checkConfigured(): Check[] {
  const envs: Record<string, boolean> = {
    mercadopago: !!process.env.MP_CLIENT_ID && !!process.env.MP_CLIENT_SECRET,
    email: !!process.env.RESEND_API_KEY,
    sentry: !!process.env.SENTRY_DSN,
  }
  return Object.entries(envs).map(([name, ok]) => ({
    name,
    status: ok ? ('ok' as const) : ('down' as const),
  }))
}

function overallFrom(checks: Check[]): CheckStatus {
  if (checks.every((c) => c.status === 'ok')) return 'ok'
  if (checks.some((c) => c.status === 'down')) return 'down'
  return 'degraded'
}

export async function GET(): Promise<Response> {
  const [db, pgboss] = await Promise.all([checkDb(), checkPgBoss()])
  const checks: Check[] = [db, pgboss, ...checkConfigured()]
  const status = overallFrom(checks)
  const httpStatus = status === 'ok' ? 200 : 503
  return Response.json(
    { status, checks, timestamp: new Date().toISOString() },
    { status: httpStatus },
  )
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm vitest run tests/unit/api-status.test.ts && pnpm typecheck
```
Expected: PASS.

- [ ] **Step 5: Smoke test against running server (optional but recommended)**

In another shell, run `pnpm dev`. Then:
```bash
curl -s http://localhost:3000/api/status | jq .
```
Expected: JSON with `status: "ok"` and 5 checks (database, pg-boss, mercadopago, email, sentry).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/status/route.ts tests/unit/api-status.test.ts
git commit -m "feat(status): real DB and pg-boss health checks with privilege fallback"
```

---

## Phase 2 — M2: E2E suite Playwright

### Task 2.1: Update `playwright.config.ts`

**Files:**
- Modify: `playwright.config.ts`

- [ ] **Step 1: Replace the config**

Open `playwright.config.ts` and replace the entire contents with:

```ts
import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: path.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: path.resolve('./tests/e2e/global-teardown.ts'),
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000/api/status',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_E2E: '1',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    },
  },
})
```

- [ ] **Step 2: Add scripts to `package.json`**

Open `package.json`. In the `scripts` block, **replace** the existing `test:e2e` line and **add** new lines so the relevant block looks like:

```json
    "test:e2e": "playwright test",
    "test:e2e:ci": "playwright test --reporter=github,html",
    "e2e:seed": "tsx scripts/seed-e2e.ts",
    "stress:bookings": "tsx scripts/stress-test.ts",
    "launch:check": "tsx scripts/launch-check.ts",
```

- [ ] **Step 3: Delete the `.gitkeep`**

```bash
git rm tests/e2e/.gitkeep
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```
Expected: PASS (no e2e file changes yet impact the typecheck; webServer env keys must be strings, which they are).

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts package.json
git commit -m "chore(playwright): config globalSetup + healthcheck webServer + scripts"
```

---

### Task 2.2: Seed E2E script with reverse-FK cleanup

**Files:**
- Create: `scripts/seed-e2e.ts`

- [ ] **Step 1: Inspect the schema**

```bash
pnpm exec drizzle-kit introspect:pg 2>&1 | tail -50
```
(Optional, only if curious. We use the spec's documented order regardless.)

- [ ] **Step 2: Write the seed**

Create `scripts/seed-e2e.ts`:

```ts
import { closeSql, getSql } from '@/shared/db/client'
import { createClient } from '@supabase/supabase-js'

const E2E = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  tenantSlug: 'e2e-complejo-demo',
  tenantName: 'E2E Complejo Demo',
  city: 'Buenos Aires',
  adminEmail: 'e2e-admin@turnogol.test',
  adminAuthUserId: '00000000-0000-4000-8000-000000000002',
  staffUserId: '00000000-0000-4000-8000-000000000003',
  courtId: '00000000-0000-4000-8000-000000000010',
  playerEmail: 'e2e-player@turnogol.test',
  playerId: '00000000-0000-4000-8000-000000000020',
  playerAuthUserId: '00000000-0000-4000-8000-000000000021',
}

type SqlClient = ReturnType<typeof getSql>

/**
 * Reverse-FK deletion order. We do NOT rely on ON DELETE CASCADE because
 * different envs may have NO ACTION on some FKs, and explicit ordering
 * surfaces seed mistakes immediately.
 */
async function cleanup(sql: SqlClient): Promise<void> {
  await sql`DELETE FROM audit_logs WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM notifications WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM cash_flows WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM daily_cash_closes WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM payments WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM bookings WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM tenant_player_bans WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM abonados WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM products WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM courts WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM player_tenant_relationships WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM tenant_staff_members WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM tenant_subscriptions WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM tenants WHERE id = ${E2E.tenantId}`
  await sql`DELETE FROM players WHERE id = ${E2E.playerId} OR email = ${E2E.playerEmail}`
  await sql`DELETE FROM staff_users WHERE id = ${E2E.staffUserId} OR email = ${E2E.adminEmail}`
}

async function cleanupAuthUsers(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  for (const id of [E2E.adminAuthUserId, E2E.playerAuthUserId]) {
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error && !/not found/i.test(error.message)) {
      throw error
    }
  }
}

async function seedTenantAndCourt(sql: SqlClient): Promise<void> {
  // Pricing JSON: 100 ARS/hr = 10000 centavos
  const pricing = {
    slots: [
      { startMin: 0, endMin: 1440, pricePerDurationMin: { 60: 10000, 120: 18000 } },
    ],
  }
  const openingHours = {
    mon: { open: '08:00', close: '23:00' },
    tue: { open: '08:00', close: '23:00' },
    wed: { open: '08:00', close: '23:00' },
    thu: { open: '08:00', close: '23:00' },
    fri: { open: '08:00', close: '23:00' },
    sat: { open: '09:00', close: '23:00' },
    sun: { open: '09:00', close: '23:00' },
  }
  await sql`
    INSERT INTO tenants (
      id, slug, name, city, province, status,
      booking_advance_days, deposit_mode, opening_hours
    ) VALUES (
      ${E2E.tenantId}, ${E2E.tenantSlug}, ${E2E.tenantName}, ${E2E.city}, ${'Buenos Aires'}, 'active',
      6, 'off', ${JSON.stringify(openingHours)}::jsonb
    )
  `
  await sql`
    INSERT INTO courts (id, tenant_id, name, status, pricing, slot_duration_minutes)
    VALUES (${E2E.courtId}, ${E2E.tenantId}, ${'Cancha E2E 1'}, 'online', ${JSON.stringify(pricing)}::jsonb, 60)
  `
}

async function seedStaffAndPlayer(sql: SqlClient): Promise<void> {
  await sql`
    INSERT INTO staff_users (id, email, full_name)
    VALUES (${E2E.staffUserId}, ${E2E.adminEmail}, ${'E2E Admin'})
  `
  await sql`
    INSERT INTO tenant_staff_members (tenant_id, staff_user_id, role)
    VALUES (${E2E.tenantId}, ${E2E.staffUserId}, 'admin')
  `
  await sql`
    INSERT INTO players (id, email, first_name, last_name, status, agreed_to_terms_at, terms_version)
    VALUES (${E2E.playerId}, ${E2E.playerEmail}, ${'E2E'}, ${'Player'}, 'active', NOW(), 'v1')
  `
  await sql`
    INSERT INTO player_tenant_relationships (tenant_id, player_id, balance)
    VALUES (${E2E.tenantId}, ${E2E.playerId}, 0)
  `
}

async function seedAuthUsers(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // Admin auth user
  {
    const { error } = await supabase.auth.admin.createUser({
      id: E2E.adminAuthUserId,
      email: E2E.adminEmail,
      email_confirm: true,
      user_metadata: { staff_user_id: E2E.staffUserId },
      app_metadata: { tenant_id: E2E.tenantId, role: 'admin' },
    })
    if (error) throw error
  }
  // Player auth user
  {
    const { error } = await supabase.auth.admin.createUser({
      id: E2E.playerAuthUserId,
      email: E2E.playerEmail,
      email_confirm: true,
      app_metadata: { player_id: E2E.playerId },
    })
    if (error) throw error
  }
}

async function main(): Promise<void> {
  const sql = getSql()
  try {
    await cleanupAuthUsers()
    await cleanup(sql)
    await seedTenantAndCourt(sql)
    await seedStaffAndPlayer(sql)
    await seedAuthUsers()
    console.log('E2E seed OK')
    console.log(`  tenant: ${E2E.tenantId} (${E2E.tenantSlug})`)
    console.log(`  admin:  ${E2E.adminEmail} (auth ${E2E.adminAuthUserId})`)
    console.log(`  player: ${E2E.playerEmail} (auth ${E2E.playerAuthUserId})`)
  } finally {
    await closeSql()
  }
}

main().catch((e) => {
  console.error('E2E seed failed:', e)
  process.exit(1)
})
```

**Important**: column names (`booking_advance_days`, `deposit_mode`, `opening_hours`, `slot_duration_minutes`, `tenant_player_bans` etc) must match the actual Drizzle schema. Before running, verify by reading `src/shared/db/schema/*.ts`. If a column doesn't exist, **remove it from the INSERT**; if a NOT NULL column is missing, **add it** (use a sane default).

- [ ] **Step 3: Run the seed (requires Supabase local + env vars)**

```bash
pnpm e2e:seed
```
Expected: prints "E2E seed OK" + the 3 lines below.

If it fails with a column error: open the Drizzle schema for the offending table, fix the INSERT, re-run.

- [ ] **Step 4: Verify idempotency**

```bash
pnpm e2e:seed && pnpm e2e:seed
```
Expected: both runs print "E2E seed OK". No duplicate-key error.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-e2e.ts
git commit -m "feat(scripts): deterministic E2E seed with reverse-FK cleanup"
```

---

### Task 2.3: Global setup + teardown

**Files:**
- Create: `tests/e2e/global-setup.ts`
- Create: `tests/e2e/global-teardown.ts`

- [ ] **Step 1: Write the global setup**

Create `tests/e2e/global-setup.ts`:

```ts
import { execSync } from 'node:child_process'

async function waitForHealth(url: string, timeoutMs = 60_000): Promise<void> {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.status === 200) return
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Health check timeout: ${url}`)
}

export default async function globalSetup(): Promise<void> {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
  console.log('[e2e] running seed-e2e...')
  execSync('pnpm e2e:seed', { stdio: 'inherit' })
  console.log(`[e2e] waiting for ${base}/api/status...`)
  await waitForHealth(`${base}/api/status`, 120_000)
  console.log('[e2e] ready')
}
```

- [ ] **Step 2: Write the global teardown**

Create `tests/e2e/global-teardown.ts`:

```ts
/**
 * No-op for now. The seed is idempotent, so the next run cleans up its own state.
 * If we ever add DB-writing specs (currently all read-only), add per-spec cleanup
 * via `test.afterEach` rather than here.
 */
export default async function globalTeardown(): Promise<void> {
  // intentionally empty
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/global-setup.ts tests/e2e/global-teardown.ts
git commit -m "test(e2e): global setup with seed + healthcheck wait"
```

---

### Task 2.4: Auth fixtures via Supabase admin

**Files:**
- Create: `tests/e2e/fixtures.ts`

- [ ] **Step 1: Write the fixture**

Create `tests/e2e/fixtures.ts`:

```ts
import { test as base, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'e2e-admin@turnogol.test'
const PLAYER_EMAIL = 'e2e-player@turnogol.test'

async function buildStorageStateFor(
  email: string,
  next: string,
): Promise<Parameters<BrowserContext['storageState']>[0] extends infer T ? T : never> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase env vars required for E2E fixtures')
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${process.env.E2E_BASE_URL ?? 'http://localhost:3000'}${next}` },
  })
  if (error || !data.properties?.action_link) {
    throw new Error(`generateLink failed: ${error?.message ?? 'no action_link'}`)
  }
  // The action_link points to Supabase's verify endpoint, which sets cookies and redirects.
  // We follow it once headlessly to capture the cookies.
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(data.properties.action_link)
  await page.waitForURL((url) => !url.toString().includes('verify'))
  const state = await ctx.storageState()
  await browser.close()
  return state as unknown as Parameters<BrowserContext['storageState']>[0]
}

type Fixtures = {
  adminStorageState: string
  playerStorageState: string
}

export const test = base.extend<Fixtures>({
  adminStorageState: [async ({}, use) => {
    const state = await buildStorageStateFor(ADMIN_EMAIL, '/dashboard')
    await use(JSON.stringify(state))
  }, { scope: 'worker' }],
  playerStorageState: [async ({}, use) => {
    const state = await buildStorageStateFor(PLAYER_EMAIL, '/')
    await use(JSON.stringify(state))
  }, { scope: 'worker' }],
})

export { expect } from '@playwright/test'
```

(Note: the `storageState` return type from Playwright is complex; we serialize to JSON and let consumers pass it via `test.use({ storageState: JSON.parse(adminStorageState) })`.)

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/fixtures.ts
git commit -m "test(e2e): auth fixtures via Supabase admin.generateLink"
```

---

### Task 2.5: `landing.spec.ts`

**Files:**
- Create: `tests/e2e/landing.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/landing.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('landing page', () => {
  test('renders hero + primary CTA', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Primary CTA to /explorar
    const cta = page.getByRole('link', { name: /explorar complejos/i }).first()
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', /\/explorar/)
  })

  test('clicking CTA navigates to /explorar', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /explorar complejos/i }).first().click()
    await expect(page).toHaveURL(/\/explorar/)
  })

  test('no console errors on load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Allow Next.js dev warnings; only fail on real errors that are not from Next overlay
    const filtered = errors.filter((e) =>
      !e.includes('Hydration') &&
      !e.includes('Download the React DevTools') &&
      !e.includes('[next-auth]'),
    )
    expect(filtered, `Console errors: ${JSON.stringify(filtered)}`).toEqual([])
  })
})
```

- [ ] **Step 2: Verify the actual CTA text in `src/app/page.tsx`**

```bash
grep -n "Explorar" src/app/page.tsx
```

If the CTA text is different (e.g., "Ver complejos" or "Explorar"), update the `getByRole('link', { name: /.../i })` regex in the spec accordingly. The text must match the rendered button.

- [ ] **Step 3: Start dev server in another shell + run the spec**

In shell 1:
```bash
pnpm dev
```

In shell 2:
```bash
pnpm exec playwright test tests/e2e/landing.spec.ts
```
Expected: 3 passed.

If it fails because the heading or CTA can't be found, inspect `src/app/page.tsx` and adjust the selectors. The spec **must reflect what's actually rendered**, not what we wish were rendered.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/landing.spec.ts
git commit -m "test(e2e): landing page hero + CTA + console-clean"
```

---

### Task 2.6: `portal-search.spec.ts`

**Files:**
- Create: `tests/e2e/portal-search.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/portal-search.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('portal search (/explorar)', () => {
  test('shows the E2E seeded tenant card', async ({ page }) => {
    await page.goto('/explorar')
    await expect(page.getByText('E2E Complejo Demo')).toBeVisible()
  })

  test('filter by city "Buenos Aires" includes the demo tenant', async ({ page }) => {
    await page.goto('/explorar?city=Buenos+Aires')
    await expect(page.getByText('E2E Complejo Demo')).toBeVisible()
  })

  test('search input filters to the demo tenant', async ({ page }) => {
    await page.goto('/explorar')
    const input = page.getByPlaceholder(/buscar|ciudad|complejo/i).first()
    await input.fill('demo')
    // Trigger search (URL update may be debounced; press Enter to commit)
    await input.press('Enter')
    await expect(page.getByText('E2E Complejo Demo')).toBeVisible()
  })

  test('click on tenant card navigates to /<slug>', async ({ page }) => {
    await page.goto('/explorar')
    await page.getByRole('link', { name: /E2E Complejo Demo/i }).first().click()
    await expect(page).toHaveURL(/\/e2e-complejo-demo/)
  })
})
```

- [ ] **Step 2: Run the spec**

```bash
pnpm exec playwright test tests/e2e/portal-search.spec.ts
```
Expected: 4 passed.

If selectors don't match (e.g., the search input has a different placeholder), inspect `src/app/(public)/explorar/components/SearchBar.tsx` and adjust accordingly.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/portal-search.spec.ts
git commit -m "test(e2e): portal search city filter + text search"
```

---

### Task 2.7: `availability.spec.ts`

**Files:**
- Create: `tests/e2e/availability.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/availability.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('public availability', () => {
  test('tenant page shows name + city + daily grid', async ({ page }) => {
    await page.goto('/e2e-complejo-demo')
    await expect(page.getByText('E2E Complejo Demo')).toBeVisible()
    await expect(page.getByText(/Buenos Aires/i)).toBeVisible()
    // Daily grid contains at least one slot label (HH:MM)
    await expect(page.getByText(/\b\d{2}:\d{2}\b/).first()).toBeVisible()
  })

  test('navigates to weekly availability', async ({ page }) => {
    await page.goto('/e2e-complejo-demo')
    await page.getByRole('link', { name: /ver semana completa|semana/i }).first().click()
    await expect(page).toHaveURL(/\/e2e-complejo-demo\/disponibilidad/)
  })

  test('weekly view shows multiple days', async ({ page }) => {
    await page.goto('/e2e-complejo-demo/disponibilidad')
    // Expect at least 5 day headers (lun, mar, mié, jue, vie, sáb, dom)
    const days = await page.getByText(/\b(lun|mar|mi[eé]|jue|vie|s[aá]b|dom)\b/i).count()
    expect(days).toBeGreaterThanOrEqual(5)
  })

  test('free future slot links to /reservar', async ({ page }) => {
    await page.goto('/e2e-complejo-demo/disponibilidad')
    // Any anchor whose href contains /reservar
    const reservarLink = page.locator('a[href*="/reservar"]').first()
    await expect(reservarLink).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the spec**

```bash
pnpm exec playwright test tests/e2e/availability.spec.ts
```
Expected: 4 passed.

Adjust selectors if the actual rendered text differs (e.g., "Ver semana" vs "Ver semana completa").

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/availability.spec.ts
git commit -m "test(e2e): public availability daily + weekly views"
```

---

### Task 2.8: `admin-login.spec.ts`

**Files:**
- Create: `tests/e2e/admin-login.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/admin-login.spec.ts`:

```ts
import { test, expect } from './fixtures'

test.describe('admin login flow', () => {
  test('unauthenticated /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page shows email input', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel(/email/i)).toBeVisible()
  })

  test('submitting email triggers "check your inbox" message', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('e2e-admin@turnogol.test')
    await page.getByRole('button', { name: /(enviar|entrar|continuar)/i }).click()
    await expect(page.getByText(/(revis[áa] tu mail|enviamos|check your inbox)/i)).toBeVisible({ timeout: 10_000 })
  })

  test('with admin storageState, /dashboard renders', async ({ browser, adminStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByText(/E2E Complejo Demo/i)).toBeVisible()
    await ctx.close()
  })
})
```

- [ ] **Step 2: Run the spec**

```bash
pnpm exec playwright test tests/e2e/admin-login.spec.ts
```
Expected: 4 passed.

If the dashboard does not show the tenant name (it might show in the header pill or somewhere else), inspect `src/app/(admin)/dashboard/page.tsx` and adjust the assertion (perhaps `expect(page).toHaveTitle(/dashboard/i)` is enough).

- [ ] **Step 3: Run the full E2E suite**

```bash
pnpm test:e2e
```
Expected: all specs PASS (landing + portal-search + availability + admin-login).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/admin-login.spec.ts
git commit -m "test(e2e): admin login redirect + form + storageState dashboard access"
```

---

## Phase 3 — M3: Stress test + Launch script + LAUNCH.md

### Task 3.1: Guarded `/api/__e2e__/create-booking` endpoint

**Files:**
- Create: `src/app/api/__e2e__/create-booking/route.ts`
- Test: `tests/unit/e2e-endpoint-guard.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/e2e-endpoint-guard.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const ORIGINAL_E2E = process.env.NEXT_PUBLIC_E2E
const ORIGINAL_NODE = process.env.NODE_ENV

afterEach(() => {
  process.env.NEXT_PUBLIC_E2E = ORIGINAL_E2E
  ;(process.env as Record<string, string | undefined>).NODE_ENV = ORIGINAL_NODE
})

describe('/api/__e2e__/create-booking guards', () => {
  it('returns 404 when NEXT_PUBLIC_E2E is not "1"', async () => {
    process.env.NEXT_PUBLIC_E2E = ''
    ;(process.env as Record<string, string>).NODE_ENV = 'development'
    const { POST } = await import('@/app/api/__e2e__/create-booking/route')
    const req = new NextRequest('http://localhost/api/__e2e__/create-booking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('returns 404 when NODE_ENV is "production" even with E2E=1', async () => {
    process.env.NEXT_PUBLIC_E2E = '1'
    ;(process.env as Record<string, string>).NODE_ENV = 'production'
    const { POST } = await import('@/app/api/__e2e__/create-booking/route')
    const req = new NextRequest('http://localhost/api/__e2e__/create-booking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm vitest run tests/unit/e2e-endpoint-guard.test.ts
```
Expected: FAIL — route module does not exist.

- [ ] **Step 3: Implement the endpoint**

Create `src/app/api/__e2e__/create-booking/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createOnlineBooking } from '@/modules/bookings/booking.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isE2EAllowed(): boolean {
  return process.env.NEXT_PUBLIC_E2E === '1' && process.env.NODE_ENV !== 'production'
}

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  courtId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isE2EAllowed()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const playerId = req.headers.get('x-e2e-player-id')
  if (!playerId) {
    return NextResponse.json({ error: 'missing player header' }, { status: 400 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  try {
    const booking = await createOnlineBooking({
      tenantId: parsed.data.tenantId,
      courtId: parsed.data.courtId,
      playerId,
      date: parsed.data.date,
      timeStart: parsed.data.timeStart,
      timeEnd: parsed.data.timeEnd,
    })
    return NextResponse.json({ bookingId: booking.id }, { status: 200 })
  } catch (e) {
    const msg = (e as Error).message ?? 'unknown'
    if (/SlotTaken|exclusion|23P01/i.test(msg)) {
      return NextResponse.json({ error: 'SLOT_TAKEN' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

**Important**: the input shape of `createOnlineBooking` may differ from the assumption above. Open `src/modules/bookings/booking.service.ts`, read the type of its sole parameter, and **adjust the `bodySchema` + the call** to match. The point is: this endpoint is a thin shim that forwards an HTTP-validated payload into the existing service.

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm vitest run tests/unit/e2e-endpoint-guard.test.ts && pnpm typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/__e2e__/create-booking/route.ts tests/unit/e2e-endpoint-guard.test.ts
git commit -m "feat(api): guarded __e2e__ create-booking endpoint with 404 in prod"
```

---

### Task 3.2: `scripts/stress-test.ts`

**Files:**
- Create: `scripts/stress-test.ts`

- [ ] **Step 1: Write the script**

Create `scripts/stress-test.ts`:

```ts
import { closeSql, getSql } from '@/shared/db/client'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const SLOT_COUNT = 50

const E2E_TENANT_ID = '00000000-0000-4000-8000-000000000001'
const E2E_COURT_ID = '00000000-0000-4000-8000-000000000010'

type Result = {
  ok: boolean
  status: number
  bookingId?: string
  error?: string
}

async function attemptBooking(
  playerId: string,
  slot: { tenantId: string; courtId: string; date: string; timeStart: string; timeEnd: string },
): Promise<Result> {
  try {
    const res = await fetch(`${BASE}/api/__e2e__/create-booking`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-e2e-player-id': playerId,
      },
      body: JSON.stringify(slot),
    })
    const body = (await res.json().catch(() => ({}))) as { bookingId?: string; error?: string }
    return { ok: res.ok, status: res.status, bookingId: body.bookingId, error: body.error }
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message }
  }
}

async function createStressPlayers(n: number): Promise<string[]> {
  const sql = getSql()
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const email = `e2e_stress_${Date.now()}_${i}@turnogol.test`
    const rows = await sql<{ id: string }[]>`
      INSERT INTO players (email, first_name, last_name, status, agreed_to_terms_at, terms_version)
      VALUES (${email}, ${'Stress'}, ${'P' + i}, 'active', NOW(), 'v1')
      RETURNING id
    `
    ids.push(rows[0]!.id)
  }
  // Link each player to the E2E tenant (so RLS player_self_ptr_insert isn't the bottleneck)
  for (const pid of ids) {
    await sql`
      INSERT INTO player_tenant_relationships (tenant_id, player_id, balance)
      VALUES (${E2E_TENANT_ID}, ${pid}, 0)
      ON CONFLICT DO NOTHING
    `
  }
  return ids
}

async function cleanupStress(playerIds: string[], winningBookingId?: string): Promise<void> {
  const sql = getSql()
  if (winningBookingId) {
    await sql`DELETE FROM cash_flows WHERE booking_id = ${winningBookingId}`
    await sql`DELETE FROM payments WHERE booking_id = ${winningBookingId}`
    await sql`DELETE FROM bookings WHERE id = ${winningBookingId}`
  }
  if (playerIds.length > 0) {
    await sql`DELETE FROM player_tenant_relationships WHERE player_id = ANY(${playerIds})`
    await sql`DELETE FROM players WHERE id = ANY(${playerIds})`
  }
}

function tomorrowIso(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function main(): Promise<void> {
  const slot = {
    tenantId: E2E_TENANT_ID,
    courtId: E2E_COURT_ID,
    date: tomorrowIso(),
    timeStart: '10:00',
    timeEnd: '11:00',
  }

  console.log(`Creating ${SLOT_COUNT} stress players...`)
  const playerIds = await createStressPlayers(SLOT_COUNT)

  let winningBookingId: string | undefined
  let invariantHeld = false

  try {
    console.log(`Firing ${SLOT_COUNT} parallel bookings on ${slot.date} ${slot.timeStart}-${slot.timeEnd}...`)
    const barrier = new Promise<void>((resolve) => setTimeout(resolve, 100))
    const promises = playerIds.map(async (pid) => {
      await barrier
      return attemptBooking(pid, slot)
    })
    const results = await Promise.all(promises)

    const accepted = results.filter((r) => r.ok && r.bookingId)
    const rejected = results.filter((r) => !r.ok || !r.bookingId)
    winningBookingId = accepted[0]?.bookingId

    console.log(`Accepted: ${accepted.length}`)
    console.log(`Rejected: ${rejected.length}`)
    const reasons = new Map<string, number>()
    for (const r of rejected) {
      const k = `${r.status}:${r.error ?? 'unknown'}`
      reasons.set(k, (reasons.get(k) ?? 0) + 1)
    }
    for (const [k, v] of reasons) console.log(`  ${k}: ${v}`)

    if (accepted.length !== 1) {
      console.error(`FAIL: expected exactly 1 accepted, got ${accepted.length}`)
      process.exitCode = 1
    } else {
      console.log('OK: invariant held (exactly 1 accepted)')
      invariantHeld = true
    }
  } finally {
    console.log('Cleaning up stress data...')
    await cleanupStress(playerIds, winningBookingId)
    await closeSql()
  }

  if (!invariantHeld) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Run the stress test**

In shell 1 (if not already running):
```bash
NEXT_PUBLIC_E2E=1 pnpm dev
```
(Windows PowerShell: `$env:NEXT_PUBLIC_E2E='1'; pnpm dev`)

In shell 2 (with same env so the script can read it for the player INSERTs):
```bash
pnpm stress:bookings
```
Expected:
```
Creating 50 stress players...
Firing 50 parallel bookings on YYYY-MM-DD 10:00-11:00...
Accepted: 1
Rejected: 49
  409:SLOT_TAKEN: 49
OK: invariant held (exactly 1 accepted)
Cleaning up stress data...
```

If `accepted.length > 1`: there is a real concurrency bug. Use `superpowers:systematic-debugging`. Do NOT skip this — the entire fase-3 concurrency work hinges on this invariant.

If `accepted.length === 0`: the endpoint or seed is broken (e.g., court not online, tenant not active, RLS blocking player). Fix the seed/endpoint and re-run.

- [ ] **Step 3: Verify cleanup**

```bash
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "SELECT count(*) FROM players WHERE email LIKE 'e2e_stress_%'"
```
Expected: `count = 0`.

- [ ] **Step 4: Commit**

```bash
git add scripts/stress-test.ts
git commit -m "feat(scripts): HTTP stress test for concurrent booking creation"
```

---

### Task 3.3: `scripts/launch-check.ts`

**Files:**
- Create: `scripts/launch-check.ts`

- [ ] **Step 1: Write the script**

Create `scripts/launch-check.ts`:

```ts
import { execSync } from 'node:child_process'

type Step = {
  name: string
  cmd?: () => void
  check?: () => Promise<boolean>
  fatal: boolean
}

const REQUIRED_ENV = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MP_CLIENT_ID',
  'MP_CLIENT_SECRET',
  'MP_WEBHOOK_SECRET',
  'ENCRYPTION_KEY',
  'PIN_COOKIE_SECRET',
  'RESEND_API_KEY',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'NEXT_PUBLIC_APP_URL',
] as const

function envCheck(): boolean {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(', ')}`)
    return false
  }
  return true
}

async function statusCheck(): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${base}/api/status`)
    if (res.status !== 200) {
      console.error(`/api/status returned ${res.status}`)
      return false
    }
    const body = (await res.json()) as { status: string }
    return body.status === 'ok'
  } catch (e) {
    console.error(`/api/status fetch failed: ${(e as Error).message}`)
    return false
  }
}

const steps: Step[] = [
  { name: 'env vars present',          check: async () => envCheck(),                                                              fatal: true  },
  { name: 'typecheck',                 cmd:   () => execSync('pnpm typecheck',         { stdio: 'inherit' }),                       fatal: true  },
  { name: 'lint',                      cmd:   () => execSync('pnpm lint',              { stdio: 'inherit' }),                       fatal: true  },
  { name: 'unit tests',                cmd:   () => execSync('pnpm test',              { stdio: 'inherit' }),                       fatal: true  },
  { name: 'integration tests',         cmd:   () => execSync('pnpm test:integration',  { stdio: 'inherit' }),                       fatal: true  },
  { name: 'isolation tests',           cmd:   () => execSync('pnpm test:isolation',    { stdio: 'inherit' }),                       fatal: true  },
  { name: 'build',                     cmd:   () => execSync('pnpm build',             { stdio: 'inherit' }),                       fatal: true  },
  { name: 'e2e',                       cmd:   () => execSync('pnpm test:e2e:ci',       { stdio: 'inherit' }),                       fatal: true  },
  { name: 'stress (1 accepted)',       cmd:   () => execSync('pnpm stress:bookings',   { stdio: 'inherit' }),                       fatal: true  },
  { name: '/api/status healthy',       check: statusCheck,                                                                          fatal: false },
]

async function main(): Promise<void> {
  const failed: string[] = []
  for (const step of steps) {
    const t0 = Date.now()
    process.stdout.write(`▶ ${step.name}... `)
    try {
      if (step.cmd) step.cmd()
      else if (step.check) {
        const ok = await step.check()
        if (!ok) throw new Error('check returned false')
      }
      console.log(`OK (${Date.now() - t0}ms)`)
    } catch (e) {
      console.log('FAIL')
      console.error(`  ${(e as Error).message}`)
      failed.push(step.name)
      if (step.fatal) break
    }
  }
  if (failed.length > 0) {
    console.error(`\n${failed.length} step(s) failed: ${failed.join(', ')}`)
    process.exit(1)
  }
  console.log('\nAll launch checks passed.')
}

main()
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```
Expected: PASS.

- [ ] **Step 3: Dry-run with intentionally missing env vars**

```bash
# Remove an env var temporarily to validate the check
unset MP_CLIENT_ID  # Windows: $env:MP_CLIENT_ID=$null
pnpm launch:check
```
Expected: prints "Missing env vars: MP_CLIENT_ID" and exits 1.

Restore the env var afterward (`export MP_CLIENT_ID=...` or reload your `.env`).

- [ ] **Step 4: Commit**

```bash
git add scripts/launch-check.ts
git commit -m "feat(scripts): launch-check automation gate"
```

---

### Task 3.4: `docs/LAUNCH.md`

**Files:**
- Create: `docs/LAUNCH.md`

- [ ] **Step 1: Write the checklist**

Create `docs/LAUNCH.md`:

```markdown
# TurnoGol — Launch Checklist (manual ops)

Ítems no automatizables. El operador debe verificar en consola la condición antes de tildar.
`pnpm launch:check` cubre lo automatizable.

## Infraestructura
- [ ] Dominio comprado y DNS apuntando a Vercel
- [ ] Certificado HTTPS válido (verificar en navegador)
- [ ] Supabase project en plan Pro (no free, sin auto-pausa)
- [ ] Backups Supabase configurados (daily, retención ≥7 días)
- [ ] Vercel project: branch production = main, preview = PR
- [ ] Env vars cargadas en Vercel (production + preview)
- [ ] Upstash Redis project creado, URL+TOKEN en Vercel

## MercadoPago
- [ ] App MP en "Producción" (no sandbox)
- [ ] Webhook URL: https://<dominio>/api/webhooks/mercadopago
- [ ] Webhook secret rotado y cargado en MP_WEBHOOK_SECRET
- [ ] OAuth redirect_uri whitelisted: https://<dominio>/api/mp/callback
- [ ] Test OAuth completo con 1 tenant piloto (link + delink)

## Email (Resend)
- [ ] Dominio verificado (SPF + DKIM + DMARC)
- [ ] From address activa: noreply@<dominio>
- [ ] Test end-to-end (magic link recibido en gmail + outlook)

## Sentry
- [ ] Project creado, DSN cargado (client + server)
- [ ] Alerts:
  - error rate > 5/min sobre 5 min
  - p95 latency /api/* > 2s sobre 10 min
- [ ] Release tracking activo (VERCEL_GIT_COMMIT_SHA)
- [ ] Source maps subidos en build de producción

## Privacy / Legal (Ley 25.326)
- [ ] Términos +18 publicados en /legal/terminos
- [ ] Política de privacidad en /legal/privacidad
- [ ] Process documentado para ARCO requests
- [ ] Email legal@<dominio> configurado

## Observabilidad
- [ ] /api/status responde 200 desde dominio público
- [ ] Uptime monitor externo configurado → /api/status
- [ ] VAPID keys (Web Push) generadas y cargadas

## Rate limit
- [ ] Upstash env vars en Vercel production
- [ ] Sanity check: 31º request a /api/public/availability misma IP → 429

## Smoke test post-deploy
- [ ] `/` carga sin errores
- [ ] `/explorar` muestra al menos 1 tenant
- [ ] Login admin → /dashboard sin errores
- [ ] Crear booking manual desde grilla admin → OK
- [ ] Crear booking online como player → redirige a MP (o confirma si deposit_mode=off)
- [ ] Webhook MP llega y procesa (1 booking confirmado, 1 cash_flow, 1 payment)
- [ ] Cancelación player → estado canceled_*, cashflow ajustado

## Rollback plan
- [ ] Commit SHA de versión anterior anotado
- [ ] `vercel rollback <deployment-id>` documentado
- [ ] Última migración aplicada documentada
```

- [ ] **Step 2: Commit**

```bash
git add docs/LAUNCH.md
git commit -m "docs: LAUNCH.md manual ops checklist"
```

---

## Phase 4 — Final gate

### Task 4.1: Run the full launch-check locally

**Files:** none (verification only)

- [ ] **Step 1: Ensure all env vars in `.env` are set**

If your local `.env` is missing any of the `REQUIRED_ENV` items in `scripts/launch-check.ts`, fill them in (Supabase local URLs + service role; placeholders OK for MP/Resend/Sentry if you don't have a real prod project yet — the check only verifies presence, not validity).

- [ ] **Step 2: Run the gate**

```bash
pnpm launch:check
```
Expected: all steps print `OK (...)`, final line is `All launch checks passed.`

If any FATAL step fails, fix it before proceeding. Common gotchas:
- **e2e fails because dev server isn't running**: the `webServer` config auto-starts it; check that the Supabase local is up first.
- **stress fails with 0 accepted**: seed didn't run or court is offline; re-run `pnpm e2e:seed`.
- **/api/status returns 503 but everything seems fine**: check pg-boss is reachable (`getBoss()` may fail if no `DATABASE_URL`).

- [ ] **Step 3: Update `.env.test.example`**

Open `.env.test.example` (or create it if absent). Add at the end (idempotent — only add if missing):

```
# E2E
NEXT_PUBLIC_E2E=1
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
E2E_BASE_URL=http://localhost:3000
```

- [ ] **Step 4: Commit env.test.example update**

```bash
git add .env.test.example
git commit -m "chore: document E2E env vars in .env.test.example"
```

---

### Task 4.2: Push branch + open PR

**Files:** none (git only)

- [ ] **Step 1: Sanity check before push**

```bash
git log --oneline fase-4-testing-launch ^main
```
Expected: ~20 commits, all conventional commit messages.

- [ ] **Step 2: Push**

```bash
git push -u origin fase-4-testing-launch
```

- [ ] **Step 3: Open PR (only if user explicitly asks; otherwise stop here)**

Pause and let the user decide whether to open the PR via GitHub UI or `gh pr create`. Do NOT auto-open.

---

## Notes for the executor

1. **Order matters**: phases are sequenced because M2 depends on `/api/status` from M1 (webServer healthcheck), and M3 depends on the seed from M2 (stress test uses E2E court/tenant).
2. **TDD discipline**: every code change with a unit test has the test written first, run failing, then implementation, then run passing. Don't skip the failing run — it confirms you're actually testing what you think.
3. **Adjusting selectors**: E2E specs use selectors based on assumptions about rendered UI text. When a selector doesn't match, **inspect the actual rendered page** (`npx playwright codegen http://localhost:3000` is the canonical tool) and adjust. The specs must reflect reality, not wishful thinking.
4. **Don't add features not in this plan**: if you find yourself wanting to add a 5th E2E spec or a 2nd stress scenario, stop — that's outside scope. File an issue or extend the spec first.
5. **If a test fails for a real reason**: use `superpowers:systematic-debugging`. Concurrency bugs (stress test fails the invariant) are the most likely place to hit this.
