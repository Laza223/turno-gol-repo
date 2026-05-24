# Fase 7 — Hallazgos Backend (1,2,3,4,8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the pending_payment expiry job (incl. in_process/transfer handling + safety-net sweep), notify the admin prominently on late payments, add MercadoPago OAuth token refresh (401-retry + 4h cron), and guard player cancellation against terminal tenant states.

**Architecture:** Reuse the existing race-safe `transitionFromPendingPayment` primitive for all `pending_payment → expired` transitions. Schedule pg-boss jobs through an **injectable seam** so the test suite (which does not globally mock pg-boss) never starts a real boss. Thread notification IDs out of webhook handling so emails dispatch only after the tx commits. Make the OAuth refresh + 401 retry logic standalone & unit-testable; wire the refreshing gateway into the automated webhook path.

**Tech Stack:** Next.js 14, TypeScript strict, Drizzle ORM, postgres.js, pg-boss v9, Vitest, MercadoPago SDK (`mercadopago`), AES-256-GCM (`@/lib/crypto/encrypt`).

---

## Ground-truth facts (verified in code)

- `expirePendingBooking(bookingId, tx)` already exists (`booking.service.ts:408`) → delegates to `transitionFromPendingPayment(bookingId, 'expired', tx)` (race-safe conditional UPDATE, returns `{won:boolean,row?}`).
- `createOnlineBooking` sets `status:'pending_payment'` only when `withDeposit` (`booking.service.ts:265`).
- `payment.service.ts:257-265` documents the exact expiry policy: check `EXISTS payments WHERE booking_id=b.id AND status='in_process'` → 48h cutoff else 15min.
- `handleApproved` (`payment.service.ts:217`) already writes `booking.late_payment_attempt` audit log on terminal late payment.
- `tenants` schema already has `mpAccessToken`, `mpRefreshToken`, `mpUserId`, `mpConnectedAt` — **no migration needed**.
- `tenant_status` enum includes `blocked` and `deleted`.
- `payment_status` enum includes `in_process`.
- OAuth exchange pattern: `fetch('https://api.mercadopago.com/oauth/token', { POST json { client_id, client_secret, grant_type, ... } })`; env `MP_CLIENT_ID`/`MP_CLIENT_SECRET`. `connectMercadoPago(tenantId, {...})` persists tokens.
- Notification templates registered in `templates/index.ts` (type export + import + `TemplateDataMap` + `RENDERERS`).
- pg-boss worker pattern: `boss.schedule(QUEUE, cron, {})` + `boss.work<T>(QUEUE, job => {...})`; jobs may arrive as arrays (`Array.isArray(job)`).
- Worker DB access (`getDb()`/`getSql()`) bypasses RLS (service role) — proven by `auto-complete-bookings.worker.ts`.
- `tests/setup.ts` does NOT mock pg-boss; mocking is per-file. 3 integration tests create deposit bookings: `booking-checkout.test.ts`, `bookings.test.ts`, `booking-api.test.ts`.
- `dispatchEmail(id)` must be called AFTER the inserting tx commits (`notification.service.ts:97`).

---

## File Structure

**Create**
- `src/shared/jobs/schedule-expiry.ts` — injectable scheduler seam (`scheduleBookingExpiry`, `setExpiryScheduler`).
- `src/modules/bookings/booking.expiry.ts` — `expirePendingBookingWithPolicy(bookingId)` + `sweepExpiredPendingBookings()` (in_process-aware policy).
- `src/shared/jobs/workers/expire-pending-booking.worker.ts` — job consumer + 5-min sweep cron.
- `src/modules/notifications/templates/admin-late-payment.ts` — Task 2 admin template.
- `src/modules/payments/mp-oauth.ts` — `withTokenRefresh`, `isMpUnauthorized`, `refreshMpAccessToken`, `refreshTenantMpToken`, `resolveTenantGateway`.
- `src/shared/jobs/workers/refresh-mp-tokens.worker.ts` — 4h token-refresh cron.
- Tests: `tests/unit/schedule-expiry.test.ts`, `tests/unit/mp-oauth.test.ts`, `tests/integration/booking-expiry.test.ts`, plus additions to `tests/integration/cancellations.test.ts` and `tests/unit/notification-templates.test.ts`.

**Modify**
- `src/shared/jobs/definitions.ts` — queue names, payload types, send options.
- `src/modules/bookings/booking.service.ts` — enqueue expiry in `createOnlineBooking`.
- `src/shared/jobs/workers/index.ts` — register 2 new workers.
- `src/modules/notifications/templates/index.ts` — register `admin_late_payment`.
- `src/modules/payments/payment.service.ts` — enqueue admin notification in `handleApproved`, thread `notificationIds` through `dispatchPaymentInfo`.
- `src/modules/payments/payment.types.ts` — add `notificationIds?` to `WebhookOutcome`.
- `src/modules/payments/mp-gateway.implementation.ts` — optional refresh hook + 401 retry via `withTokenRefresh`.
- `src/modules/payments/mp-webhook.handler.ts` — use `resolveTenantGateway`; dispatch threaded notifications post-commit.
- `src/modules/bookings/booking.errors.ts` — `TenantInactiveError`.
- `src/modules/bookings/booking.cancellation.ts` — tenant-status guard in `cancelByPlayer`.
- `src/app/api/player/bookings/[id]/cancel/route.ts` — map `TenantInactiveError`.
- `tests/integration/booking-checkout.test.ts`, `bookings.test.ts`, `booking-api.test.ts` — `setExpiryScheduler` override.

---

## TASK 1 — Pending-payment expiry (Hallazgos 1 + 2)

**Files:** definitions.ts, schedule-expiry.ts (create), booking.expiry.ts (create), expire-pending-booking.worker.ts (create), workers/index.ts, booking.service.ts, 3 integration tests.

### Definitions
Add to `src/shared/jobs/definitions.ts`:
```ts
export const QUEUE_EXPIRE_PENDING_BOOKING = 'expire-pending-booking'
export const QUEUE_EXPIRE_PENDING_BOOKING_SWEEP = 'expire-pending-booking-sweep'

export type ExpirePendingBookingJobData = { bookingId: string }

export const EXPIRE_PENDING_BOOKING_SEND_OPTIONS = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  expireInHours: 49, // must outlive the 48h in_process cutoff
} as const

export const DEFAULT_EXPIRY_SECONDS = 15 * 60
export const IN_PROCESS_EXPIRY_SECONDS = 48 * 60 * 60
```

### Scheduler seam (`src/shared/jobs/schedule-expiry.ts`)
```ts
import { getBoss } from './boss'
import {
  QUEUE_EXPIRE_PENDING_BOOKING,
  EXPIRE_PENDING_BOOKING_SEND_OPTIONS,
  DEFAULT_EXPIRY_SECONDS,
  type ExpirePendingBookingJobData,
} from './definitions'

export type ExpiryScheduler = (bookingId: string, startAfterSeconds: number) => Promise<void>

let _override: ExpiryScheduler | null = null
/** Test seam — mirrors setBillingGateway. Pass null to restore real pg-boss. */
export function setExpiryScheduler(fn: ExpiryScheduler | null): void {
  _override = fn
}

export async function scheduleBookingExpiry(
  bookingId: string,
  startAfterSeconds: number = DEFAULT_EXPIRY_SECONDS,
): Promise<void> {
  if (_override) return _override(bookingId, startAfterSeconds)
  const boss = await getBoss()
  const data: ExpirePendingBookingJobData = { bookingId }
  await boss.send(QUEUE_EXPIRE_PENDING_BOOKING, data, {
    ...EXPIRE_PENDING_BOOKING_SEND_OPTIONS,
    startAfter: Math.max(0, Math.round(startAfterSeconds)),
  })
}
```

### Policy core (`src/modules/bookings/booking.expiry.ts`)
- `loadExpiryState(bookingId)` via `getDb()`: returns `{ status, createdAt, tenantId, courtName, date, timeStart, playerId, hasInProcess }` (LEFT JOIN courts; `EXISTS` subquery for in_process payment) or null.
- `expirePendingBookingWithPolicy(bookingId)`:
  - load state; if null or `status !== 'pending_payment'` → return `{ action: 'skipped' }`.
  - `cutoffSeconds = hasInProcess ? IN_PROCESS_EXPIRY_SECONDS : DEFAULT_EXPIRY_SECONDS`.
  - `elapsed = (Date.now() - createdAt.getTime())/1000`.
  - if `elapsed < cutoffSeconds` → `await scheduleBookingExpiry(bookingId, cutoffSeconds - elapsed)`; return `{ action: 'rescheduled' }` (the in_process / fired-early branch — does NOT expire).
  - else: `const res = await db.transaction(tx => expirePendingBooking(bookingId, tx) ...)`. On `won`:
    - always enqueue player `deposit_expired` notification (in tx) → collect id.
    - if `hasInProcess`: also enqueue `admin_late_payment`-style admin notification via `enqueueTenantOwnerNotification` (transfer that never confirmed) → collect ids.
    - after commit `dispatchEmail` each id.
    - return `{ action: 'expired' }`. If `!won` → `{ action: 'skipped' }`.
- `sweepExpiredPendingBookings()`: `getDb()` SELECT ids where `status='pending_payment'` AND `(NOT hasInProcess AND created_at < now()-'15 min') OR (hasInProcess AND created_at < now()-'48 hours')`; for each id `await expirePendingBookingWithPolicy(id)`.

> Reschedule + transition both use the race-safe primitive, so duplicate jobs / sweep overlap are harmless (loser no-ops).

### Worker (`src/shared/jobs/workers/expire-pending-booking.worker.ts`)
```ts
import type PgBoss from 'pg-boss'
import {
  QUEUE_EXPIRE_PENDING_BOOKING,
  QUEUE_EXPIRE_PENDING_BOOKING_SWEEP,
  type ExpirePendingBookingJobData,
} from '../definitions'
import {
  expirePendingBookingWithPolicy,
  sweepExpiredPendingBookings,
} from '@/modules/bookings/booking.expiry'

export async function registerExpirePendingBookingWorker(boss: PgBoss): Promise<void> {
  await boss.work<ExpirePendingBookingJobData>(QUEUE_EXPIRE_PENDING_BOOKING, async (job) => {
    const j = Array.isArray(job) ? job[0] : job
    if (!j?.data?.bookingId) return
    await expirePendingBookingWithPolicy(j.data.bookingId)
  })

  await boss.schedule(QUEUE_EXPIRE_PENDING_BOOKING_SWEEP, '*/5 * * * *', {})
  await boss.work(QUEUE_EXPIRE_PENDING_BOOKING_SWEEP, async () => {
    await sweepExpiredPendingBookings()
  })
  console.log(`[workers] registered ${QUEUE_EXPIRE_PENDING_BOOKING}`)
}
```
Register in `workers/index.ts`.

### Enqueue on creation (`booking.service.ts`)
In `createOnlineBooking`, after the `track.booking('booking.online.create.success', …)` call and before `return booking`, when `booking.status === 'pending_payment'`:
```ts
if (booking.status === 'pending_payment') {
  // Hallazgo 1: arm the 15-min expiry. Runs through an injectable seam so the
  // test suite never starts a real pg-boss. A rollback after this send leaves an
  // orphan job that no-ops (race-safe transition) and is also covered by the sweep.
  await scheduleBookingExpiry(booking.id)
}
```
Import `scheduleBookingExpiry` from `@/shared/jobs/schedule-expiry`.

### Tests
- `tests/unit/schedule-expiry.test.ts`: with `setExpiryScheduler(spy)`, `scheduleBookingExpiry('b1')` calls spy with `('b1', 900)`; reset with `setExpiryScheduler(null)`.
- `tests/integration/booking-expiry.test.ts` (real DB): (a) pending_payment older than 15min, no payment → policy `expired`, slot freed; (b) pending_payment with `in_process` payment & recent → policy `rescheduled`, still pending; (c) pending_payment with `in_process` & `created_at` backdated >48h → policy `expired`. Use `setExpiryScheduler` spy to capture reschedule and avoid real boss.
- Patch `booking-checkout.test.ts`, `bookings.test.ts`, `booking-api.test.ts`: `beforeAll(setExpiryScheduler(async () => {}))`, `afterAll(setExpiryScheduler(null))`.

---

## TASK 2 — Prominent late-payment admin notification (Hallazgo 3)

**Files:** templates/admin-late-payment.ts (create), templates/index.ts, payment.service.ts, payment.types.ts, mp-webhook.handler.ts, notification-templates.test.ts.

- Template `admin_late_payment` data: `{ bookingId, amountArs: string, courtName?, date?, currentStatus? }`; subject `"⚠️ Pago tardío recibido — acción requerida"`; body states a late payment of `$X` arrived for expired booking `[bookingId]` and manual refund/reassignment is required. Register in `templates/index.ts`.
- `payment.types.ts`: extend the active `WebhookOutcome` variant with `notificationIds?: string[]`.
- `payment.service.ts` `handleApproved`: keep the audit log. When terminal, also build amount string (`(info.amount/100).toFixed(2)`) and call `enqueueTenantOwnerNotification({ tenantId, templateName:'admin_late_payment', content:{...}, triggerEvent:'booking.late_payment_attempt' }, tx)`. Since that helper returns void, add an internal variant that collects inserted notification IDs (or query the just-inserted rows) and return `{ won:false, notificationIds }`. Bubble `notificationIds` through `dispatchPaymentInfo`’s return.
- `mp-webhook.handler.ts`: capture the `withTenantContext` return; after commit, `for (const id of outcome?.notificationIds ?? []) await dispatchEmail(id)`.
- Test: `notification-templates.test.ts` renders `admin_late_payment` and asserts subject/body contains the amount and bookingId.

> Decision (per Hallazgo 3): **Option B** (notify, no auto-refund) — refunds need complejo consent in v1.

---

## TASK 3 — MercadoPago OAuth token refresh (Hallazgo 4)

**Files:** mp-oauth.ts (create), mp-gateway.implementation.ts, mp-webhook.handler.ts, refresh-mp-tokens.worker.ts (create), workers/index.ts, definitions.ts, mp-oauth.test.ts (create).

- `definitions.ts`: `export const QUEUE_REFRESH_MP_TOKENS = 'refresh-mp-tokens'`.
- `mp-oauth.ts`:
  - `isMpUnauthorized(err): boolean` — true if `err.status===401 || err.statusCode===401` or message/cause indicates 401/unauthorized (handles `MpGatewayError` wrapping via `.cause`).
  - `withTokenRefresh<T>(op: () => Promise<T>, refresh: () => Promise<void>): Promise<T>` — run `op`; on `isMpUnauthorized` run `refresh` then retry `op` once; rethrow otherwise. **Unit-tested directly.**
  - `refreshMpAccessToken(encryptedRefreshToken): Promise<{accessToken,refreshToken,userId?,publicKey?}>` — `decrypt` then `fetch(oauth/token, grant_type:'refresh_token')`; throw `MpGatewayError` on non-ok.
  - `refreshTenantMpToken(tenantId): Promise<string>` — load tenant `mpRefreshToken`; if absent throw `TenantMpNotConnectedError`; refresh; persist `encrypt`-ed access+refresh + `mpConnectedAt` (reuse `connectMercadoPago` or direct update); return new **encrypted** access token.
  - `resolveTenantGateway(tenantId, encryptedAccessToken): PaymentGateway` — `new MercadoPagoGateway(encryptedAccessToken, { onUnauthorized: async () => refreshTenantMpToken(tenantId) })`.
- `mp-gateway.implementation.ts`: constructor `(encryptedAccessToken, options?: { onUnauthorized?: () => Promise<string> })`. Store hook. Add private `private async withRefresh<T>(op): Promise<T>` that, if hook present, wraps with `withTokenRefresh(op, async () => { this.config = mpClient(await hook()) })`, else just `op()`. Wrap `getPaymentStatus`, `createRefund`, `createPreference` bodies in `this.withRefresh(...)`. Backward compatible.
- `mp-webhook.handler.ts`: replace `new MercadoPagoGateway(tenant.mpAccessToken)` with `resolveTenantGateway(tenant.id, tenant.mpAccessToken)`.
- `refresh-mp-tokens.worker.ts`: `boss.schedule(QUEUE_REFRESH_MP_TOKENS, '0 */4 * * *', {})` + `boss.work` → select tenants `WHERE mp_refresh_token IS NOT NULL AND status IN ('active','trialing','past_due','suspended')`; `for` each `try { await refreshTenantMpToken(id) } catch (e) { console.error(...) }`. Register in `workers/index.ts`.
- Test `mp-oauth.test.ts`: `isMpUnauthorized` truth table; `withTokenRefresh` retries once on 401 then succeeds, does not retry on non-401, surfaces second failure; `refreshMpAccessToken` with mocked `global.fetch` (set `ENCRYPTION_KEY`, `MP_CLIENT_ID/SECRET`).

> Documented choice: **both** — proactive 4h cron (avoids cold 401s at request time) AND reactive 401-retry fail-safe on the automated webhook path.

---

## TASK 4 — Tenant-status guard on player cancel (Hallazgo 8)

**Files:** booking.errors.ts, booking.cancellation.ts, player cancel route, cancellations.test.ts.

- `booking.errors.ts`: `export class TenantInactiveError extends Error { constructor(public readonly tenantId: string, public readonly status: string){ super(\`Tenant ${tenantId} is ${status}; cancellation not allowed\`); this.name='TenantInactiveError' } }`.
- `cancelByPlayer`: after `lockBooking` + ownership/status checks, before `loadSettings`/refund, query tenant status:
  ```ts
  const tRows = await tx.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, b.tenant_id)).limit(1)
  const tStatus = tRows[0]?.status
  if (!tStatus || tStatus === 'deleted' || tStatus === 'blocked') {
    throw new TenantInactiveError(b.tenant_id, tStatus ?? 'unknown')
  }
  ```
  (Prevents firing `createRefund` against a delinked MP account.)
- Player cancel route: map `TenantInactiveError` → 409 `{ code:'TENANT_INACTIVE' }`.
- Test (`cancellations.test.ts`): confirmed booking in a `deleted` tenant → `cancelByPlayer` rejects with `TenantInactiveError` and booking stays `confirmed`.

---

## Self-Review
- **Spec coverage:** H1 (enqueue + worker), H2 (in_process 48h reschedule + sweep), H3 (admin notify threaded post-commit), H4 (refresh cron + 401 retry), H8 (tenant guard) — all mapped. ✓
- **Types:** `ExpirePendingBookingJobData`, `WebhookOutcome.notificationIds`, gateway ctor 2nd arg, `TenantInactiveError` consistent across tasks. ✓
- **No placeholders:** concrete code/SQL/asserts per task. ✓
- **Risk:** enqueue inside an open tx → orphan-on-rollback is harmless (race-safe transition + sweep). Test suite shielded by `setExpiryScheduler`.
