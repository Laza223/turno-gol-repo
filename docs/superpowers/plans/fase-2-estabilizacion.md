# Fase 2: Estabilización + Completitud Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar las brechas de estabilización de TurnoGol: resolver los 4 tests `todo`, dejar la suite de integración 100% verde sobre Supabase local, y completar las páginas admin enlazadas pero faltantes (`/settings/facturacion`, `/reservas` + `/reservas/[id]`, `/abonados/nuevo`), borrando los `configuracion/*` vestigiales.

**Architecture:** El build (typecheck/lint/build) y la suite unit ya están verdes salvo 4 `it.todo`. Esos 4 casos se cubren en **integración** (DB real, acciones DB-pesadas). Las páginas admin nuevas siguen el patrón existente (`extractAuthUser` → `getStaffTenant` → `withTenantContext`) y el diseño de `dashboard.tsx`/`AdminLayoutShell`. La suite de integración se levanta con `supabase start` + `scripts/bootstrap-test-db.mjs`.

**Tech Stack:** Next.js 14 (App Router, Server Components + Server Actions), TypeScript strict, Drizzle ORM + postgres-js, Supabase local (Postgres 54322 + Auth), Vitest (unit + integration), MercadoPago.

---

## File Structure

**[NEW]**
- `tests/integration/staff-actions.test.ts` — cubre `deactivateStaffAction` + `inviteStaffAction` (4 casos)
- `src/app/(admin)/settings/facturacion/page.tsx` — suscripción + conexión MercadoPago
- `src/app/(admin)/reservas/queries.ts` — `listTenantBookings` + `getBookingDetail`
- `src/app/(admin)/reservas/page.tsx` — lista de reservas con filtros
- `src/app/(admin)/reservas/[id]/page.tsx` — detalle de reserva
- `src/app/(admin)/reservas/[id]/BookingActions.tsx` — botones complete/no-show/cancel (client)
- `src/app/(admin)/abonados/nuevo/page.tsx` — form de alta de abonado
- `src/app/(admin)/abonados/nuevo/actions.ts` — `submitNewAbonado`
- `src/app/(admin)/abonados/nuevo/AbonadoForm.tsx` — form (client)
- `tests/integration/reservas-queries.test.ts` — cubre las queries de reservas

**[MODIFY]**
- `src/app/(admin)/settings/reservas/page.tsx` — agregar tab "Facturación" a `SETTINGS_TABS`
- `src/app/(admin)/settings/horarios/page.tsx` — idem
- `src/app/(admin)/settings/pin/page.tsx` — idem

**[DELETE]**
- `tests/unit/staff-actions.test.ts` (solo 4 `it.todo`)
- `src/app/(admin)/configuracion/canchas/.gitkeep`
- `src/app/(admin)/configuracion/precios/.gitkeep`
- `src/app/(admin)/configuracion/horarios/.gitkeep`
- `src/app/(admin)/configuracion/facturacion/.gitkeep`
- `src/app/(admin)/configuracion/equipo/.gitkeep`
- `src/app/(admin)/reservas/[id]/.gitkeep`
- `src/app/(admin)/abonados/nuevo/.gitkeep`

---

## Task 1: Baseline gate + feature branch

**Files:** none (verification only)

- [ ] **Step 1: Create the feature branch**

Run:
```bash
git checkout -b fase-2-estabilizacion
```
Expected: switched to a new branch.

- [ ] **Step 2: Confirm the baseline is green**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm test
```
Expected:
- `typecheck`: no output (0 errors).
- `lint`: `✖ 4 problems (0 errors, 4 warnings)` — the 4 `<img>` warnings are accepted (out of scope).
- `test`: `171 passed | 4 todo (175)`, 1 file skipped (`staff-actions.test.ts`).

If any of these regressed from the baseline, stop and investigate before continuing — this plan assumes a green starting point.

- [ ] **Step 3: Note the gate command for later**

The full gate (used in Task 10) is:
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm build
```
No commit for this task.

---

## Task 2: Resolve the 4 `todo` — staff actions integration test

**Files:**
- Create: `tests/integration/staff-actions.test.ts`
- Delete: `tests/unit/staff-actions.test.ts`

Context: `inviteStaffAction` / `deactivateStaffAction` (`src/app/(admin)/staff/actions.ts`) run real Drizzle query chains inside `withTenantContext` and call `createAdminClient().auth.admin`. They are covered at the integration layer (real DB) with the auth/admin boundary mocked.

- [ ] **Step 1: Write the integration test**

```ts
// tests/integration/staff-actions.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

// DB stays real (withTenantContext); only the auth + external boundary is mocked.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('unexpected redirect')
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))

const inviteUserByEmail = vi.fn()
const updateUserById = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { inviteUserByEmail, updateUserById } } }),
}))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { deactivateStaffAction, inviteStaffAction } from '@/app/(admin)/staff/actions'

function asStaff(tenantId: string, staffUserId: string) {
  vi.mocked(extractAuthUser).mockResolvedValue({
    type: 'staff',
    id: 'auth-1',
    email: 'owner@test.local',
    staffUserId,
    tenantId,
    role: 'admin',
  })
  vi.mocked(getStaffTenant).mockResolvedValue({ id: tenantId } as never)
}

beforeAll(async () => {
  await ensureRoles()
})
beforeEach(async () => {
  vi.clearAllMocks()
  inviteUserByEmail.mockResolvedValue({ data: { user: { id: 'new-auth-id' } }, error: null })
  updateUserById.mockResolvedValue({ data: {}, error: null })
  await cleanupAll()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('deactivateStaffAction', () => {
  it('prevents deactivating the last active admin', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    const memberId = await linkStaffToTenant(sql, tenant.id, staff.id)
    asStaff(tenant.id, staff.id)

    const res = await deactivateStaffAction(memberId)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('al menos un admin')
  })

  it('deactivates a member when more than one is active', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const s1 = await createTestStaffUser(sql)
    const s2 = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, s1.id)
    const m2 = await linkStaffToTenant(sql, tenant.id, s2.id)
    asStaff(tenant.id, s1.id)

    const res = await deactivateStaffAction(m2)
    expect(res.success).toBe(true)

    const rows = await sql<{ is_active: boolean }[]>`
      SELECT is_active FROM tenant_staff_members WHERE id = ${m2}
    `
    expect(rows[0]!.is_active).toBe(false)
  })
})

describe('inviteStaffAction', () => {
  it('returns error if the email is already an active member', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const owner = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, owner.id)
    const existing = await createTestStaffUser(sql, { email: 'dup@staff.local' })
    await linkStaffToTenant(sql, tenant.id, existing.id)
    asStaff(tenant.id, owner.id)

    const fd = new FormData()
    fd.set('email', 'dup@staff.local')
    fd.set('firstName', 'Du')
    fd.set('lastName', 'Plicado')

    const res = await inviteStaffAction(fd)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('ya es miembro')
  })

  it('creates staff_users + tenant_staff_members and sends the invite', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const owner = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, owner.id)
    asStaff(tenant.id, owner.id)

    const fd = new FormData()
    fd.set('email', 'nuevo@staff.local')
    fd.set('firstName', 'Nue')
    fd.set('lastName', 'Vo')

    const res = await inviteStaffAction(fd)
    expect(res.success).toBe(true)
    expect(inviteUserByEmail).toHaveBeenCalledWith('nuevo@staff.local', expect.any(Object))

    const su = await sql<{ id: string }[]>`SELECT id FROM staff_users WHERE email = 'nuevo@staff.local'`
    expect(su).toHaveLength(1)
    const tsm = await sql<{ id: string }[]>`
      SELECT id FROM tenant_staff_members
      WHERE staff_user_id = ${su[0]!.id} AND tenant_id = ${tenant.id} AND is_active = true
    `
    expect(tsm).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Delete the unit stub**

```bash
git rm tests/unit/staff-actions.test.ts
```

- [ ] **Step 3: Run the new integration test**

Run: `pnpm test:integration staff-actions`
Expected: PASS (4 tests). If it fails with a connection error, complete Task 9 Step 1–2 (Supabase setup) first, then return here.

- [ ] **Step 4: Confirm the unit suite has no more todos**

Run: `pnpm test`
Expected: `171 passed (171)` — no `todo`, no skipped files.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/staff-actions.test.ts
git commit -m "test(staff): cover invite/deactivate at integration layer, drop unit todos"
```

---

## Task 3: Delete vestigial `configuracion/*` placeholders

**Files:** delete 5 `.gitkeep`

- [ ] **Step 1: Confirm nothing links to `/configuracion`**

Run: `git grep -n "configuracion" -- src/`
Expected: no matches in `src/` (the sidebar uses `/settings/*`, `/canchas`, `/staff`). If a match appears, stop and reassess — the route is referenced and must not be deleted.

- [ ] **Step 2: Remove the directories**

```bash
git rm src/app/\(admin\)/configuracion/canchas/.gitkeep
git rm src/app/\(admin\)/configuracion/precios/.gitkeep
git rm src/app/\(admin\)/configuracion/horarios/.gitkeep
git rm src/app/\(admin\)/configuracion/facturacion/.gitkeep
git rm src/app/\(admin\)/configuracion/equipo/.gitkeep
```
> On PowerShell, quote each path instead of escaping: `git rm "src/app/(admin)/configuracion/canchas/.gitkeep"` etc.

- [ ] **Step 3: Verify build still green + commit**

Run: `pnpm build`
Expected: build succeeds (these were never routes).

```bash
git commit -m "chore(admin): remove vestigial configuracion/* placeholders"
```

---

## Task 4: `/settings/facturacion` page + tab

**Files:**
- Create: `src/app/(admin)/settings/facturacion/page.tsx`
- Modify: `src/app/(admin)/settings/reservas/page.tsx`, `.../horarios/page.tsx`, `.../pin/page.tsx`

- [ ] **Step 1: Create the facturación page**

```tsx
// src/app/(admin)/settings/facturacion/page.tsx
import { redirect } from 'next/navigation'
import { CreditCard, CheckCircle2, ExternalLink } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getSubscriptionState } from '@/modules/billing/billing.service'
import { PinGate } from '@/components/pin-gate'

const SETTINGS_TABS = [
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/facturacion', label: 'Facturación' },
  { href: '/settings/pin', label: 'Seguridad' },
]

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Período de prueba',
  active: 'Activa',
  past_due: 'Pago pendiente',
  suspended: 'Suspendida',
  canceled: 'Cancelada',
  churned: 'Baja',
  blocked: 'Bloqueada',
}

function formatDate(d: string | Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function FacturacionPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  let sub: Awaited<ReturnType<typeof getSubscriptionState>> | null = null
  try {
    sub = await withTenantContext(tenant.id, (tx) => getSubscriptionState(tenant.id, tx))
  } catch {
    sub = null
  }
  const mpConnected = !!tenant.mpConnectedAt

  return (
    <PinGate>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>

        <nav className="flex gap-1 border-b border-slate-200">
          {SETTINGS_TABS.map(({ href, label }) => {
            const active = href === '/settings/facturacion'
            return (
              <a
                key={href}
                href={href}
                className={
                  'px-4 py-2 text-sm font-medium transition-colors duration-150 border-b-2 ' +
                  (active
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-900')
                }
              >
                {label}
              </a>
            )
          })}
        </nav>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Suscripción</h2>
          {sub ? (
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">Plan</dt>
                <dd className="font-medium text-slate-900">{sub.planName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Estado</dt>
                <dd className="font-medium text-slate-900">{STATUS_LABELS[sub.status] ?? sub.status}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Próximo cobro</dt>
                <dd className="font-medium text-slate-900 tabular-nums">{formatDate(sub.currentPeriodEnd)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Todavía no tenés una suscripción activa. Conectá MercadoPago para empezar a cobrar señas y activar tu plan.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <CreditCard className="h-5 w-5 text-emerald-600" aria-hidden /> MercadoPago
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Conectá tu cuenta para cobrar las señas de las reservas online directamente.
              </p>
            </div>
            {mpConnected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Conectado
              </span>
            )}
          </div>
          {!mpConnected && (
            <a
              href="/api/mp/oauth-start"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              Conectar MercadoPago <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          )}
        </section>
      </div>
    </PinGate>
  )
}
```

- [ ] **Step 2: Add the "Facturación" tab to the other 3 settings pages**

In each of `settings/reservas/page.tsx`, `settings/horarios/page.tsx`, `settings/pin/page.tsx`, replace the `SETTINGS_TABS` array:
```ts
const SETTINGS_TABS = [
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/pin', label: 'Seguridad' },
]
```
with:
```ts
const SETTINGS_TABS = [
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/facturacion', label: 'Facturación' },
  { href: '/settings/pin', label: 'Seguridad' },
]
```

- [ ] **Step 3: Verify the dead links resolve + commit**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: green; `/settings/facturacion` appears in the route list.
Run `pnpm dev`, open `/settings/facturacion` (the link from the trial status banner and the onboarding checklist now resolves instead of 404).

```bash
git add "src/app/(admin)/settings/"
git commit -m "feat(settings): billing/facturacion page + MercadoPago connect, fixes dead links"
```

---

## Task 5: Reservas queries module

**Files:**
- Create: `src/app/(admin)/reservas/queries.ts`
- Test: `tests/integration/reservas-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/reservas-queries.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { getBookingDetail, listTenantBookings } from '@/app/(admin)/reservas/queries'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

const PRICING = { rules: [{ days: ['mon','tue','wed','thu','fri','sat','sun'], from: '08:00', to: '23:00', prices: { '60': 900000, '120': 1700000 } }] }

async function seedBooking(tenantId: string, date: string) {
  const sql = getSql()
  const court = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, 'Cancha 1', 10, ${sql.json(PRICING)}, 'online') RETURNING id
  `
  const booking = await sql<{ id: string }[]>`
    INSERT INTO bookings (tenant_id, court_id, date, time_start, time_end, type, status, price_snapshot, guest_name)
    VALUES (${tenantId}, ${court[0]!.id}, ${date}::date, '10:00', '11:00', 'spontaneous', 'confirmed', 900000, 'Juan Invitado')
    RETURNING id
  `
  return booking[0]!.id
}

beforeAll(async () => { await ensureRoles() })
afterAll(async () => { await cleanupAll(); await closeSql() })

describe('reservas queries', () => {
  it('listTenantBookings returns rows for the tenant with court + guest name', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    await seedBooking(tenant.id, '2099-08-10')

    const rows = await withTenantContext(tenant.id, (tx) => listTenantBookings(tenant.id, {}, tx))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.courtName).toBe('Cancha 1')
    expect(rows[0]!.guestName).toBe('Juan Invitado')
    expect(rows[0]!.status).toBe('confirmed')
  })

  it('listTenantBookings filters by status', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    await seedBooking(tenant.id, '2099-08-11')

    const confirmed = await withTenantContext(tenant.id, (tx) => listTenantBookings(tenant.id, { status: 'confirmed' }, tx))
    expect(confirmed).toHaveLength(1)
    const canceled = await withTenantContext(tenant.id, (tx) => listTenantBookings(tenant.id, { status: 'canceled_no_refund' }, tx))
    expect(canceled).toHaveLength(0)
  })

  it('getBookingDetail returns the booking or null', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    const id = await seedBooking(tenant.id, '2099-08-12')

    const detail = await withTenantContext(tenant.id, (tx) => getBookingDetail(tenant.id, id, tx))
    expect(detail).not.toBeNull()
    expect(detail!.id).toBe(id)
    expect(detail!.depositStatus).toBeDefined()

    const missing = await withTenantContext(tenant.id, (tx) =>
      getBookingDetail(tenant.id, '00000000-0000-0000-0000-000000000000', tx),
    )
    expect(missing).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:integration reservas-queries`
Expected: FAIL — module `@/app/(admin)/reservas/queries` not found.

- [ ] **Step 3: Write the queries module**

```ts
// src/app/(admin)/reservas/queries.ts
import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'

export type ReservaListRow = {
  id: string
  date: string
  timeStart: string
  timeEnd: string
  status: string
  type: string
  courtName: string
  playerName: string | null
  guestName: string | null
  priceSnapshot: number
}

export async function listTenantBookings(
  tenantId: string,
  filters: { date?: string; status?: string },
  tx: DbTx,
): Promise<ReservaListRow[]> {
  const dateCond = filters.date ? sql`AND b.date = ${filters.date}::date` : sql``
  const statusCond = filters.status ? sql`AND b.status = ${filters.status}::booking_status` : sql``
  const rows = await tx.execute(sql`
    SELECT b.id, b.date::text AS date, b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd",
           b.status, b.type, b.price_snapshot AS "priceSnapshot",
           c.name AS "courtName",
           CASE WHEN p.id IS NULL THEN NULL ELSE (p.first_name || ' ' || p.last_name) END AS "playerName",
           b.guest_name AS "guestName"
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    LEFT JOIN players p ON p.id = b.player_id
    WHERE b.tenant_id = ${tenantId} ${dateCond} ${statusCond}
    ORDER BY b.date DESC, b.time_start DESC
    LIMIT 200
  `)
  return rows as unknown as ReservaListRow[]
}

export type ReservaDetail = ReservaListRow & {
  depositAmount: number
  depositStatus: string
  paymentMethod: string | null
  notesPlayer: string | null
  notesInternal: string | null
  playerPhone: string | null
  guestPhone: string | null
  canceledReason: string | null
}

export async function getBookingDetail(
  tenantId: string,
  bookingId: string,
  tx: DbTx,
): Promise<ReservaDetail | null> {
  const rows = await tx.execute(sql`
    SELECT b.id, b.date::text AS date, b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd",
           b.status, b.type, b.price_snapshot AS "priceSnapshot",
           b.deposit_amount AS "depositAmount", b.deposit_status AS "depositStatus",
           b.payment_method AS "paymentMethod", b.notes_player AS "notesPlayer",
           b.notes_internal AS "notesInternal", b.guest_name AS "guestName", b.guest_phone AS "guestPhone",
           b.canceled_reason AS "canceledReason",
           c.name AS "courtName",
           CASE WHEN p.id IS NULL THEN NULL ELSE (p.first_name || ' ' || p.last_name) END AS "playerName",
           p.phone AS "playerPhone"
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    LEFT JOIN players p ON p.id = b.player_id
    WHERE b.tenant_id = ${tenantId} AND b.id = ${bookingId}
    LIMIT 1
  `)
  const list = rows as unknown as ReservaDetail[]
  return list[0] ?? null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:integration reservas-queries`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add "src/app/(admin)/reservas/queries.ts" tests/integration/reservas-queries.test.ts
git commit -m "feat(reservas): listTenantBookings + getBookingDetail queries"
```

---

## Task 6: `/reservas` list page

**Files:**
- Create: `src/app/(admin)/reservas/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/app/(admin)/reservas/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarX } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { listTenantBookings } from './queries'

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pago pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  no_show: 'Ausente',
  canceled_refunded: 'Cancelada',
  canceled_no_refund: 'Cancelada',
  expired: 'Expirada',
}
const STATUS_CLASSES: Record<string, string> = {
  pending_payment: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  completed: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  no_show: 'bg-red-50 text-red-700 ring-red-600/20',
  canceled_refunded: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  canceled_no_refund: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  expired: 'bg-slate-100 text-slate-500 ring-slate-500/20',
}
const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'confirmed', label: 'Confirmadas' },
  { value: 'pending_payment', label: 'Pago pendiente' },
  { value: 'completed', label: 'Completadas' },
  { value: 'no_show', label: 'Ausentes' },
]

function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(cents / 100)
}
function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

type Props = { searchParams: { status?: string } }

export default async function ReservasPage({ searchParams }: Props) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const status = searchParams.status ?? ''
  const rows = await withTenantContext(tenant.id, (tx) =>
    listTenantBookings(tenant.id, status ? { status } : {}, tx),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Reservas</h1>
        <Link href="/grilla" className="inline-flex h-9 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
          Ir a la grilla
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = status === f.value
          const href = f.value ? `/reservas?status=${f.value}` : '/reservas'
          return (
            <Link key={f.label} href={href}
              className={'rounded-full px-3 py-1.5 text-xs font-medium transition-colors ' +
                (active ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50')}>
              {f.label}
            </Link>
          )
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <CalendarX className="h-10 w-10" aria-hidden />
          <p className="text-sm">No hay reservas con este filtro.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cancha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Precio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/reservas/${r.id}`} className="font-medium text-emerald-700 hover:underline tabular-nums">
                      {formatDate(r.date)} · {r.timeStart.slice(0, 5)}–{r.timeEnd.slice(0, 5)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.courtName}</td>
                  <td className="px-4 py-3 text-slate-700">{r.playerName ?? r.guestName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ' + (STATUS_CLASSES[r.status] ?? STATUS_CLASSES.completed)}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatARS(r.priceSnapshot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the dead nav link resolves + commit**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: `/reservas` appears in the route list.
Run `pnpm dev`, click "Reservas" in the sidebar → list renders (no more 404), status filter chips work.

```bash
git add "src/app/(admin)/reservas/page.tsx"
git commit -m "feat(reservas): bookings list page (fixes dead sidebar link)"
```

---

## Task 7: `/reservas/[id]` detail page + actions

**Files:**
- Create: `src/app/(admin)/reservas/[id]/BookingActions.tsx`
- Create: `src/app/(admin)/reservas/[id]/page.tsx`
- Delete: `src/app/(admin)/reservas/[id]/.gitkeep`

- [ ] **Step 1: Create the actions client component**

```tsx
// src/app/(admin)/reservas/[id]/BookingActions.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completeBookingAction, markNoShowAction, cancelBookingAction } from '../actions'

export default function BookingActions({ bookingId, status }: { bookingId: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (status !== 'confirmed') return null

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) setError(res.error ?? 'No se pudo completar la acción.')
      else router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => completeBookingAction(bookingId))}
          className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
        >
          Marcar completada
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => markNoShowAction(bookingId))}
          className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          Marcar ausente
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => cancelBookingAction(bookingId, 'Cancelada por el complejo', false))}
          className="h-9 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors"
        >
          Cancelar
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Create the detail page**

```tsx
// src/app/(admin)/reservas/[id]/page.tsx
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getBookingDetail } from '../queries'
import BookingActions from './BookingActions'

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pago pendiente', confirmed: 'Confirmada', completed: 'Completada',
  no_show: 'Ausente', canceled_refunded: 'Cancelada (con reembolso)',
  canceled_no_refund: 'Cancelada (sin reembolso)', expired: 'Expirada',
}

function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(cents / 100)
}
function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

type Props = { params: { id: string } }

export default async function ReservaDetailPage({ params }: Props) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const booking = await withTenantContext(tenant.id, (tx) => getBookingDetail(tenant.id, params.id, tx))
  if (!booking) notFound()

  const rows: Array<[string, string]> = [
    ['Fecha', `${formatDate(booking.date)} · ${booking.timeStart.slice(0, 5)}–${booking.timeEnd.slice(0, 5)}`],
    ['Cancha', booking.courtName],
    ['Cliente', booking.playerName ?? booking.guestName ?? '—'],
    ['Teléfono', booking.playerPhone ?? booking.guestPhone ?? '—'],
    ['Estado', STATUS_LABELS[booking.status] ?? booking.status],
    ['Precio', formatARS(booking.priceSnapshot)],
    ['Seña', booking.depositAmount > 0 ? `${formatARS(booking.depositAmount)} (${booking.depositStatus})` : 'Sin seña'],
    ['Método de pago', booking.paymentMethod ?? '—'],
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/reservas" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Reservas
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">Detalle de la reserva</h1>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="text-sm font-medium text-slate-900 capitalize">{value}</dd>
            </div>
          ))}
        </dl>
        {booking.notesPlayer && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Nota del jugador</dt>
            <dd className="mt-1 text-sm text-slate-700">{booking.notesPlayer}</dd>
          </div>
        )}
        {booking.canceledReason && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Motivo de cancelación</dt>
            <dd className="mt-1 text-sm text-slate-700">{booking.canceledReason}</dd>
          </div>
        )}
      </div>

      <BookingActions bookingId={booking.id} status={booking.status} />
    </div>
  )
}
```

- [ ] **Step 3: Delete the placeholder + verify + commit**

```bash
git rm "src/app/(admin)/reservas/[id]/.gitkeep"
pnpm typecheck && pnpm lint && pnpm build
```
Run `pnpm dev`, open `/reservas`, click a row → detail renders; on a `confirmed` booking the complete/no-show/cancel buttons appear and refresh the page on success.

```bash
git add "src/app/(admin)/reservas/[id]/"
git commit -m "feat(reservas): booking detail page with admin actions"
```

---

## Task 8: `/abonados/nuevo` form page

**Files:**
- Create: `src/app/(admin)/abonados/nuevo/actions.ts`
- Create: `src/app/(admin)/abonados/nuevo/AbonadoForm.tsx`
- Create: `src/app/(admin)/abonados/nuevo/page.tsx`
- Delete: `src/app/(admin)/abonados/nuevo/.gitkeep`

- [ ] **Step 1: Create the form-handling action**

```ts
// src/app/(admin)/abonados/nuevo/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createAbonadoAction } from '../actions'
import type { CreateAbonadoInput } from '@/modules/abonados/abonado.types'

const schema = z.object({
  courtId: z.string().uuid('Elegí una cancha'),
  contactName: z.string().trim().min(1, 'Nombre requerido'),
  contactPhone: z.string().trim().min(1, 'Teléfono requerido'),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/, 'Horario inválido'),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Horario inválido'),
  pricePerSession: z.coerce.number().min(0),
  monthlyPrice: z.coerce.number().min(0),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  paymentMethod: z.enum(['cash', 'transfer']).default('cash'),
  notes: z.string().trim().max(1000).optional(),
})

export type NewAbonadoState = { status: 'idle' } | { status: 'error'; message: string }

export async function submitNewAbonado(
  _prev: NewAbonadoState,
  formData: FormData,
): Promise<NewAbonadoState> {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  const d = parsed.data
  const input: CreateAbonadoInput = {
    courtId: d.courtId,
    contactName: d.contactName,
    contactPhone: d.contactPhone,
    dayOfWeek: d.dayOfWeek,
    timeStart: d.timeStart,
    timeEnd: d.timeEnd,
    pricePerSession: Math.round(d.pricePerSession * 100),
    monthlyPrice: Math.round(d.monthlyPrice * 100),
    startsOn: d.startsOn,
    paymentMethod: d.paymentMethod,
    notes: d.notes,
  }

  const result = await createAbonadoAction(input)
  if (!result.success) return { status: 'error', message: result.error }
  redirect('/abonados')
}
```

- [ ] **Step 2: Create the form (client)**

```tsx
// src/app/(admin)/abonados/nuevo/AbonadoForm.tsx
'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { submitNewAbonado, type NewAbonadoState } from './actions'

const DAYS = [
  { value: '1', label: 'Lunes' }, { value: '2', label: 'Martes' }, { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' }, { value: '5', label: 'Viernes' }, { value: '6', label: 'Sábado' }, { value: '0', label: 'Domingo' },
]
const initial: NewAbonadoState = { status: 'idle' }
const field = 'h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'
const labelCls = 'space-y-1 text-sm block'
const labelSpan = 'font-medium text-slate-900'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors">
      {pending ? 'Guardando…' : 'Crear abonado'}
    </button>
  )
}

export default function AbonadoForm({ courts }: { courts: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState(submitNewAbonado, initial)
  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelCls}>
          <span className={labelSpan}>Cancha</span>
          <select name="courtId" required className={field} defaultValue="">
            <option value="" disabled>Elegí una cancha</option>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className={labelCls}>
          <span className={labelSpan}>Día de la semana</span>
          <select name="dayOfWeek" required className={field} defaultValue="1">
            {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
        <label className={labelCls}><span className={labelSpan}>Hora inicio</span><input name="timeStart" type="time" required className={field} /></label>
        <label className={labelCls}><span className={labelSpan}>Hora fin</span><input name="timeEnd" type="time" required className={field} /></label>
        <label className={labelCls}><span className={labelSpan}>Nombre de contacto</span><input name="contactName" required className={field} /></label>
        <label className={labelCls}><span className={labelSpan}>Teléfono</span><input name="contactPhone" required className={field} /></label>
        <label className={labelCls}><span className={labelSpan}>Precio por turno (ARS)</span><input name="pricePerSession" type="number" min="0" step="0.01" required className={field} /></label>
        <label className={labelCls}><span className={labelSpan}>Precio mensual (ARS)</span><input name="monthlyPrice" type="number" min="0" step="0.01" required className={field} /></label>
        <label className={labelCls}><span className={labelSpan}>Desde</span><input name="startsOn" type="date" required className={field} /></label>
        <label className={labelCls}>
          <span className={labelSpan}>Método de pago</span>
          <select name="paymentMethod" className={field} defaultValue="cash">
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
          </select>
        </label>
      </div>
      <label className={labelCls}><span className={labelSpan}>Notas (opcional)</span><textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" /></label>
      {state.status === 'error' && <p role="alert" className="text-xs text-red-600">{state.message}</p>}
      <Submit />
    </form>
  )
}
```

- [ ] **Step 3: Create the page (server — loads courts)**

```tsx
// src/app/(admin)/abonados/nuevo/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import AbonadoForm from './AbonadoForm'

export default async function NuevoAbonadoPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const courts = await withTenantContext(tenant.id, (tx) => listCourts(tx))
  const courtOptions = courts.map((c) => ({ id: c.id, name: c.name }))

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/abonados" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Abonados
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">Nuevo abonado</h1>
      <AbonadoForm courts={courtOptions} />
    </div>
  )
}
```

> `listCourts(tx)` returns `CourtRow[]` (from `court.service.ts`), which includes `id` and `name` — the `.map` above is correct as written.

- [ ] **Step 4: Delete placeholder + verify + commit**

```bash
git rm "src/app/(admin)/abonados/nuevo/.gitkeep"
pnpm typecheck && pnpm lint && pnpm build
```
Run `pnpm dev`, open `/abonados`, click "+ Nuevo Abonado" → form renders (no 404); submitting a valid abonado redirects back to `/abonados` with the new row.

```bash
git add "src/app/(admin)/abonados/nuevo/"
git commit -m "feat(abonados): new-abonado form page (fixes dead link)"
```

---

## Task 9: Integration suite — Supabase local setup + green (Fase C)

**Files:** none (environment + triage); fixes land in the suites/source they touch.

This is a setup-and-triage task. The exact failure list is enumerated by running the suite; the steps below give the known-good setup path and a triage tree.

- [ ] **Step 1: Start Supabase local**

Run:
```bash
pnpm supabase:start
```
Expected: prints local URLs and `DB URL ... 54322`. If the CLI isn't logged in or Docker isn't running, fix that first (`supabase start` needs Docker). This applies `supabase/migrations/*` to the local DB.

- [ ] **Step 2: Bootstrap roles + raw migrations (mirrors CI)**

Run:
```bash
node scripts/bootstrap-test-db.mjs
```
Expected: `>>> creating roles`, `>>> applying 001_extensions.sql` … `009_relax_payment_consistency.sql`, `done`.
- If a statement errors because an object already exists (schema also applied by `supabase start`), the canonical test schema is `src/shared/db/migrations`. Prefer a clean DB: `pnpm supabase:reset` then re-run this script, OR rely solely on `supabase start` migrations if they are in sync (`pnpm db:sync-supabase` keeps the two sets aligned).

- [ ] **Step 3: Run the isolation suite first (blocking, RLS)**

Run:
```bash
pnpm test:isolation
```
Expected: PASS. RLS isolation is the blocking gate (CLAUDE.md). If it fails, the DB schema/policies are wrong — re-apply migrations before anything else.

- [ ] **Step 4: Run the full integration suite + capture failures**

Run:
```bash
pnpm test:integration 2>&1 | tee /tmp/integration.log
```
Record the failing suites. Triage by failure class:

| Symptom | Likely cause | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:54322` | Supabase not running | Step 1 |
| `role "turnogol_app" does not exist` | roles missing | Step 2 (or the suite's `ensureRoles()` failed) |
| `relation "<table>" does not exist` | schema not applied / drift | `pnpm supabase:reset` + Step 2; or `pnpm db:sync-supabase` |
| `new row violates row-level security` | test missing tenant/player context | set context in the test via `withTenantContext`/`withPlayerContext` (see existing suites) |
| Assertion mismatch (amounts, status) | real code/test bug | fix the source or the test per the assertion; never weaken an isolation assertion |

- [ ] **Step 5: Fix failing suites one at a time**

For each failing suite: read it, reproduce with `pnpm test:integration <name>`, fix the source or test, re-run that suite until green. Commit after each suite goes green:
```bash
git add <changed files>
git commit -m "test(integration): fix <suite-name> suite"
```
Constraints: TypeScript strict, never `any` (CLAUDE.md); never silence an isolation/RLS assertion to make it pass.

- [ ] **Step 6: Confirm the whole suite is green**

Run:
```bash
pnpm test:integration
pnpm test:isolation
```
Expected: all 15 integration suites pass (now 16+ with the new `staff-actions` and `reservas-queries` suites added in Tasks 2 and 5), isolation passes.

---

## Task 10: Final gate

**Files:** none

- [ ] **Step 1: Run the full gate**

Run:
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm build
```
Expected:
- `typecheck`: 0 errors.
- `lint`: 0 errors (4 accepted `<img>` warnings).
- `test`: all pass, **0 todo, 0 skipped**.
- `test:integration`: all suites pass.
- `build`: succeeds; route list now includes `/settings/facturacion`, `/reservas`, `/reservas/[id]`, `/abonados/nuevo`; no `/configuracion/*`.

- [ ] **Step 2: Manual smoke of the fixed dead links**

`pnpm dev`, logged in as staff:
1. Sidebar "Reservas" → `/reservas` (was 404) → list + filters + row → detail + actions.
2. Trial status banner / onboarding "MercadoPago" → `/settings/facturacion` (was 404) → subscription + connect button.
3. `/abonados` → "+ Nuevo Abonado" → `/abonados/nuevo` (was 404) → create → back to `/abonados`.
4. Settings tabs show "Facturación" on every settings page.

- [ ] **Step 3: Final commit (residual changes, if any)**

```bash
git add -A
git commit -m "chore(fase-2): final stabilization gate green"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** REQ#1 build → Task 1 + per-task gates + Task 10 ✓. REQ#2 unit 100% → Task 2 (4 todos → integration, unit stub deleted) ✓. REQ#3 integration + Supabase local → Task 9 (+ new suites in T2/T5) ✓. REQ#4 admin completeness → Task 3 (delete configuracion/*), Task 4 (facturacion), Tasks 5-7 (reservas list+detail), Task 8 (abonados/nuevo) ✓. "Decidir página vs redirect" → decided in spec (build the linked pages; delete vestigial) ✓. Refactor strategy if TS fails → spec §"Estrategia de refactor" + Task 9 constraints ✓.
- **Placeholder scan:** no `TODO`/`TBD`/`Similar to`/`fill in`. The one branching note (migration-already-applied path in T9) is an explicit environment decision, not a placeholder.
- **Type consistency:** `ReservaListRow`/`ReservaDetail` (T5) reused in T6/T7. `NewAbonadoState`/`submitNewAbonado` (T8 actions) reused in `AbonadoForm`. `CreateAbonadoInput` matches `abonado.types.ts`. `getSubscriptionState` fields (`planName`, `status`, `currentPeriodEnd`) match `billing.service.ts`. Staff action signatures (`deactivateStaffAction(id)`, `inviteStaffAction(formData)`) match `staff/actions.ts`.
- **Order:** A-gate (T1) → B (T2) → D (T3-T8) → C (T9) → final gate (T10), per spec. T2 notes the Supabase dependency (do T9 Step 1-2 first if the DB isn't up).
