# Admin Dashboard & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build admin layout shell (sidebar + header + status banners), dashboard (onboarding checklist + today's metrics), staff CRUD, and settings pages (booking policies, operating hours, PIN config).

**Architecture:** Server Components fetch data; Client Components handle interactivity. Layout shell fetches tenant + subscription once and passes serializable props to a Client Component shell. PIN gate uses Server Actions + 30-min HMAC cookie (existing `src/modules/auth/pin.ts`). Settings update tenant `settings` JSONB via PostgreSQL `||` merge operator to avoid overwriting unrelated keys (including `staff_pin_hash`).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Drizzle ORM, shadcn/ui, Tailwind CSS, Lucide React, design tokens from `design-system/MASTER.md`.

---

## File Map

**Create:**
- `src/app/(admin)/actions/auth.ts` — sign-out Server Action
- `src/app/(admin)/actions/pin.ts` — `verifyPinAction`, `checkPinSessionAction`
- `src/app/(admin)/dashboard/queries.ts` — metrics + checklist DB queries
- `src/app/(admin)/dashboard/actions.ts` — mark public link shared
- `src/app/(admin)/dashboard/page.tsx` — dashboard Server Component
- `src/app/(admin)/staff/actions.ts` — invite / deactivate / resend
- `src/app/(admin)/staff/page.tsx` — staff list + invite form
- `src/app/(admin)/settings/page.tsx` — redirect to reservas
- `src/app/(admin)/settings/reservas/page.tsx`
- `src/app/(admin)/settings/reservas/actions.ts`
- `src/app/(admin)/settings/horarios/page.tsx`
- `src/app/(admin)/settings/horarios/actions.ts`
- `src/app/(admin)/settings/pin/page.tsx` — PIN-gated
- `src/app/(admin)/settings/pin/actions.ts`
- `src/components/layout/admin-sidebar.tsx`
- `src/components/layout/admin-header.tsx`
- `src/components/layout/admin-layout-shell.tsx`
- `src/components/layout/status-banner.tsx`
- `src/components/dashboard/metric-card.tsx`
- `src/components/dashboard/onboarding-checklist.tsx`
- `src/components/pin-gate.tsx`

**Modify:**
- `src/app/(admin)/layout.tsx`

**Note:** `src/app/(admin)/configuracion/*/` contain only `.gitkeep` files — safe to delete those directories once settings routes are created.

---

## Task 1: Layout Components

**Files:**
- Create: `src/app/(admin)/actions/auth.ts`
- Create: `src/components/layout/admin-sidebar.tsx`
- Create: `src/components/layout/admin-header.tsx`
- Create: `src/components/layout/status-banner.tsx`
- Create: `src/components/layout/admin-layout-shell.tsx`

- [ ] **Step 1: Sign-out Server Action**

```typescript
// src/app/(admin)/actions/auth.ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signOutAction(): Promise<never> {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 2: Admin sidebar**

```tsx
// src/components/layout/admin-sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CalendarDays, CalendarCheck, Users,
  Trophy, Banknote, BarChart3, UserCog, Settings, Lock, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  pin?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inicio',          icon: LayoutDashboard },
  { href: '/grilla',    label: 'Grilla',           icon: CalendarDays },
  { href: '/reservas',  label: 'Reservas',         icon: CalendarCheck },
  { href: '/abonados',  label: 'Abonados',         icon: Users },
  { href: '/canchas',   label: 'Canchas',          icon: Trophy,    pin: true },
  { href: '/caja',      label: 'Caja',             icon: Banknote },
  { href: '/reportes',  label: 'Reportes',         icon: BarChart3, pin: true },
  { href: '/staff',     label: 'Equipo',           icon: UserCog,   pin: true },
  { href: '/settings',  label: 'Configuración',    icon: Settings,  pin: true },
]

interface AdminSidebarProps {
  tenantName: string
  mobileOpen: boolean
  onClose: () => void
}

export function AdminSidebar({ tenantName, mobileOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname()

  const NavContent = () => (
    <>
      <div className="px-6 py-3 shrink-0 border-b border-slate-100">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Complejo</p>
        <p className="mt-0.5 truncate text-sm font-medium text-slate-900">{tenantName}</p>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 pt-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon, pin }) => {
          const active =
            pathname === href ||
            (href !== '/dashboard' && pathname.startsWith(href + '/'))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                active
                  ? 'bg-sky-50 text-sky-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {pin && (
                <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Requiere PIN" />
              )}
            </Link>
          )
        })}
      </nav>
    </>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-10 lg:flex lg:w-60 lg:flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 shrink-0 items-center border-b border-slate-200 px-6">
          <span className="text-base font-semibold text-slate-900">TurnoGol</span>
        </div>
        <NavContent />
      </aside>

      {/* Mobile */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <span className="text-base font-semibold text-slate-900">TurnoGol</span>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar menú">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <NavContent />
      </aside>
    </>
  )
}
```

- [ ] **Step 3: Admin header**

```tsx
// src/components/layout/admin-header.tsx
'use client'

import { LogOut, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AdminHeaderProps {
  userEmail: string
  mobileMenuOpen: boolean
  onMobileMenuToggle: () => void
  onSignOut: () => void
}

export function AdminHeader({
  userEmail,
  mobileMenuOpen,
  onMobileMenuToggle,
  onSignOut,
}: AdminHeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-20 flex h-16 items-center border-b border-slate-200 bg-white px-4 sm:px-6 lg:left-60">
      <Button
        variant="ghost"
        size="icon"
        className="mr-4 lg:hidden"
        onClick={onMobileMenuToggle}
        aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
      >
        {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      <div className="flex flex-1 items-center justify-end gap-4">
        <span className="hidden text-xs text-slate-500 sm:block">{userEmail}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSignOut}
          className="text-slate-600 hover:text-slate-900"
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          Salir
        </Button>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Status banner**

```tsx
// src/components/layout/status-banner.tsx
'use client'

import Link from 'next/link'
import { AlertTriangle, Clock, XCircle } from 'lucide-react'

interface StatusBannerProps {
  tenantStatus: string
  trialEndsAt: string | null
  subStatus: string | null
  periodEnd: string | null
}

function daysUntil(isoDate: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / msPerDay))
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
}

export function StatusBanner({ tenantStatus, trialEndsAt, subStatus, periodEnd }: StatusBannerProps) {
  if (process.env.NEXT_PUBLIC_SERVICE_DEGRADED === 'true') {
    return (
      <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 sm:px-6 lg:px-8">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <p className="text-sm text-amber-800">
          Estamos experimentando problemas técnicos. Algunas funciones pueden no estar disponibles.
        </p>
      </div>
    )
  }

  if (tenantStatus === 'trialing' && trialEndsAt) {
    const days = daysUntil(trialEndsAt)
    return (
      <div className="flex items-center justify-between gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
          <p className="text-sm text-sky-800">
            Período de prueba:{' '}
            <strong>
              {days} {days === 1 ? 'día' : 'días'} restante{days !== 1 ? 's' : ''}
            </strong>.
          </p>
        </div>
        <Link
          href="/settings/facturacion"
          className="shrink-0 text-sm font-medium text-sky-700 underline transition-colors duration-150 hover:text-sky-900"
        >
          Elegir plan
        </Link>
      </div>
    )
  }

  if (tenantStatus === 'past_due' && periodEnd) {
    return (
      <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 sm:px-6 lg:px-8">
        <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
        <p className="text-sm text-red-800">
          Tu pago falló. Regularizá antes del <strong>{formatDate(periodEnd)}</strong> para continuar usando TurnoGol.{' '}
          <Link
            href="/settings/facturacion"
            className="font-medium underline transition-colors duration-150 hover:text-red-900"
          >
            Actualizar pago
          </Link>
        </p>
      </div>
    )
  }

  if (tenantStatus === 'suspended') {
    return (
      <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 sm:px-6 lg:px-8">
        <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
        <p className="text-sm text-red-800">
          Tu cuenta está suspendida. Contactá a{' '}
          <a href="mailto:soporte@turnogol.app" className="font-medium underline">
            soporte@turnogol.app
          </a>
          .
        </p>
      </div>
    )
  }

  return null
}
```

- [ ] **Step 5: Admin layout shell (Client Component)**

```tsx
// src/components/layout/admin-layout-shell.tsx
'use client'

import { useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { AdminSidebar } from './admin-sidebar'
import { AdminHeader } from './admin-header'
import { StatusBanner } from './status-banner'

interface AdminLayoutShellProps {
  children: ReactNode
  tenantName: string
  tenantStatus: string
  trialEndsAt: string | null
  subStatus: string | null
  periodEnd: string | null
  userEmail: string
  signOut: () => Promise<never>
}

export function AdminLayoutShell({
  children,
  tenantName,
  tenantStatus,
  trialEndsAt,
  subStatus,
  periodEnd,
  userEmail,
  signOut,
}: AdminLayoutShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [, startTransition] = useTransition()

  const handleSignOut = () => startTransition(() => signOut())

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar
        tenantName={tenantName}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      {mobileOpen && (
        <div
          className="fixed inset-0 z-[15] bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="lg:pl-60">
        <AdminHeader
          userEmail={userEmail}
          mobileMenuOpen={mobileOpen}
          onMobileMenuToggle={() => setMobileOpen((o) => !o)}
          onSignOut={handleSignOut}
        />

        <main className="pt-16">
          <StatusBanner
            tenantStatus={tenantStatus}
            trialEndsAt={trialEndsAt}
            subStatus={subStatus}
            periodEnd={periodEnd}
          />
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors. Fix any before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/app/(admin)/actions/auth.ts src/components/layout/
git commit -m "feat: add admin layout shell — sidebar, header, status banners"
```

---

## Task 2: Wire Admin Layout

**Files:**
- Modify: `src/app/(admin)/layout.tsx`

- [ ] **Step 1: Replace layout content**

```typescript
// src/app/(admin)/layout.tsx
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import type { ReactNode } from 'react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { tenantSubscriptions } from '@/shared/db/schema'
import { AdminLayoutShell } from '@/components/layout/admin-layout-shell'
import { signOutAction } from '@/app/(admin)/actions/auth'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff') redirect('/login')
  if (!user.staffUserId) redirect('/login')
  if (!user.tenantId) redirect('/onboarding')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const settings = tenant.settings as TenantSettings
  if (!settings.onboarding_completed) redirect('/onboarding')

  const sub = await withTenantContext(tenant.id, async (tx) => {
    return tx.query.tenantSubscriptions.findFirst({
      where: eq(tenantSubscriptions.tenantId, tenant.id),
      columns: { status: true, currentPeriodEnd: true },
    })
  })

  return (
    <AdminLayoutShell
      tenantName={tenant.name}
      tenantStatus={tenant.status}
      trialEndsAt={tenant.trialEndsAt?.toISOString() ?? null}
      subStatus={sub?.status ?? null}
      periodEnd={sub?.currentPeriodEnd?.toISOString() ?? null}
      userEmail={user.email}
      signOut={signOutAction}
    >
      {children}
    </AdminLayoutShell>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors. If `TenantSettings` type doesn't include `onboarding_completed`, add it:
```typescript
// src/modules/tenants/tenant.types.ts — add these fields if missing
onboarding_completed?: boolean
onboarding_step?: number
public_link_shared?: boolean
staff_pin_hash?: string
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(admin)/layout.tsx
git commit -m "feat: wire admin layout with tenant context and status banners"
```

---

## Task 3: Dashboard DB Queries

**Files:**
- Create: `src/app/(admin)/dashboard/queries.ts`

- [ ] **Step 1: Write integration test (documents expected shape)**

```typescript
// src/app/(admin)/dashboard/queries.test.ts
import { describe, expect, it } from 'vitest'
// These run against a real DB in CI (pnpm test:integration).
// They document the return shape; skip in unit test mode.

describe('getDashboardMetrics', () => {
  it.todo('returns bookingsToday, revenueTodayCents, activeAbonados as numbers')
})

describe('getChecklistState', () => {
  it.todo('returns all 7 boolean checklist fields')
})
```

Run: `pnpm test -- queries.test`
Expected: 2 todo tests, 0 failures.

- [ ] **Step 2: Implement queries**

```typescript
// src/app/(admin)/dashboard/queries.ts
import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { withTenantContext } from '@/shared/db/client'
import { abonados, bookings, courts } from '@/shared/db/schema'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

export interface DashboardMetrics {
  bookingsToday: number
  revenueTodayCents: number
  activeAbonados: number
}

export interface ChecklistState {
  accountCreated: boolean
  complexData: boolean
  hasCourts: boolean
  hasSchedule: boolean
  mpConnected: boolean
  publicLinkShared: boolean
  firstBookingReceived: boolean
}

function todayInArgentina(): Date {
  const str = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  return new Date(str)
}

export async function getDashboardMetrics(tenantId: string): Promise<DashboardMetrics> {
  return withTenantContext(tenantId, async (tx) => {
    const today = todayInArgentina()

    const [bookingsRow, revenueRow, abonadosRow] = await Promise.all([
      tx
        .select({ value: count() })
        .from(bookings)
        .where(and(eq(bookings.tenantId, tenantId), eq(bookings.date, today)))
        .then((r) => r[0]),

      tx
        .select({ value: sql<string>`COALESCE(SUM(price_snapshot), 0)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.tenantId, tenantId),
            eq(bookings.date, today),
            sql`status IN ('confirmed', 'completed')`,
          ),
        )
        .then((r) => r[0]),

      tx
        .select({ value: count() })
        .from(abonados)
        .where(and(eq(abonados.tenantId, tenantId), eq(abonados.status, 'active')))
        .then((r) => r[0]),
    ])

    return {
      bookingsToday: Number(bookingsRow?.value ?? 0),
      revenueTodayCents: Number(revenueRow?.value ?? 0),
      activeAbonados: Number(abonadosRow?.value ?? 0),
    }
  })
}

export async function getChecklistState(
  tenantId: string,
  settings: TenantSettings,
  mpConnected: boolean,
): Promise<ChecklistState> {
  return withTenantContext(tenantId, async (tx) => {
    const [courtsCount, firstBooking] = await Promise.all([
      tx
        .select({ value: count() })
        .from(courts)
        .where(eq(courts.tenantId, tenantId))
        .then((r) => Number(r[0]?.value ?? 0)),

      tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.tenantId, tenantId),
            isNull(bookings.createdByStaff),
          ),
        )
        .limit(1)
        .then((r) => r[0] ?? null),
    ])

    return {
      accountCreated: true,
      complexData: true,
      hasCourts: courtsCount > 0,
      hasSchedule: true,
      mpConnected,
      publicLinkShared: settings.public_link_shared === true,
      firstBookingReceived: firstBooking !== null,
    }
  })
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm typecheck`
```bash
git add src/app/(admin)/dashboard/queries.ts src/app/(admin)/dashboard/queries.test.ts
git commit -m "feat: add dashboard DB queries for metrics and checklist state"
```

---

## Task 4: Dashboard Components + Page

**Files:**
- Create: `src/components/dashboard/metric-card.tsx`
- Create: `src/app/(admin)/dashboard/actions.ts`
- Create: `src/components/dashboard/onboarding-checklist.tsx`
- Create: `src/app/(admin)/dashboard/page.tsx`

- [ ] **Step 1: Metric card component**

```tsx
// src/components/dashboard/metric-card.tsx
import type { ReactNode } from 'react'

interface MetricCardProps {
  label: string
  value: string
  icon: ReactNode
  sub?: string
}

export function MetricCard({ label, value, icon, sub }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="text-slate-400">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Mark public-link-shared Server Action**

```typescript
// src/app/(admin)/dashboard/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { eq } from 'drizzle-orm'

export async function markPublicLinkSharedAction(): Promise<void> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return

  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({
        settings: sql`settings || '{"public_link_shared": true}'::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/dashboard')
}
```

- [ ] **Step 3: Onboarding checklist component**

```tsx
// src/components/dashboard/onboarding-checklist.tsx
'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Circle, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ChecklistState } from '@/app/(admin)/dashboard/queries'
import { markPublicLinkSharedAction } from '@/app/(admin)/dashboard/actions'

interface ChecklistItem {
  key: keyof ChecklistState
  label: string
  href?: string
  action?: 'copy-link'
}

const ITEMS: ChecklistItem[] = [
  { key: 'accountCreated',      label: 'Cuenta creada' },
  { key: 'complexData',         label: 'Datos del complejo completados' },
  { key: 'hasCourts',           label: 'Al menos una cancha configurada',    href: '/canchas' },
  { key: 'hasSchedule',         label: 'Horarios definidos',                 href: '/settings/horarios' },
  { key: 'mpConnected',         label: 'MercadoPago conectado',              href: '/settings/facturacion' },
  { key: 'publicLinkShared',    label: 'Link público compartido',            action: 'copy-link' },
  { key: 'firstBookingReceived',label: 'Primera reserva online recibida' },
]

interface OnboardingChecklistProps {
  state: ChecklistState
  tenantSlug: string
  appUrl: string
}

export function OnboardingChecklist({ state, tenantSlug, appUrl }: OnboardingChecklistProps) {
  const completed = ITEMS.filter((i) => state[i.key]).length
  const total = ITEMS.length
  const pct = Math.round((completed / total) * 100)
  const [minimized, setMinimized] = useState(completed === total)
  const [copied, setCopied] = useState(false)
  const [, startTransition] = useTransition()

  const publicUrl = `${appUrl}/c/${tenantSlug}`

  async function handleCopyLink() {
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    if (!state.publicLinkShared) {
      startTransition(() => markPublicLinkSharedAction())
    }
  }

  if (minimized) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
          <p className="text-sm font-medium text-green-800">¡Tu complejo está 100% listo!</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMinimized(false)}
          className="text-xs text-green-700 hover:text-green-900"
        >
          Ver checklist
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Progreso de configuración</h2>
          <p className="mt-0.5 text-xs text-slate-500">{completed} de {total} completados</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-sky-600 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-medium tabular-nums text-slate-600">{pct}%</span>
          </div>
          {completed === total && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMinimized(true)}
              className="text-xs"
            >
              Minimizar
            </Button>
          )}
        </div>
      </div>

      <ul className="divide-y divide-slate-50 px-6">
        {ITEMS.map(({ key, label, href, action }) => {
          const done = state[key]
          return (
            <li key={key} className="flex items-center gap-3 py-3">
              {done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" />
              )}
              <span
                className={cn(
                  'flex-1 text-sm',
                  done ? 'text-slate-400 line-through' : 'text-slate-700',
                )}
              >
                {label}
              </span>

              {!done && action === 'copy-link' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  className="h-8 text-xs"
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {copied ? 'Copiado!' : 'Copiar link'}
                </Button>
              )}

              {!done && href && (
                <a
                  href={href}
                  className="flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900"
                >
                  Configurar
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}

              {!done && key === 'firstBookingReceived' && state.publicLinkShared && (
                <p className="text-xs text-slate-500">Compartí tu link para recibir reservas.</p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Dashboard page**

```tsx
// src/app/(admin)/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { CalendarCheck, Banknote, Users } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { MetricCard } from '@/components/dashboard/metric-card'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import { getDashboardMetrics, getChecklistState } from './queries'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

export default async function DashboardPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const settings = tenant.settings as TenantSettings
  const checklistDone = !!(
    settings.onboarding_completed &&
    settings.public_link_shared
  )

  const [metrics, checklistState] = await Promise.all([
    getDashboardMetrics(tenant.id),
    getChecklistState(tenant.id, settings, !!tenant.mpAccessToken),
  ])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Inicio</h1>
        <p className="mt-1 text-sm text-slate-500">
          {new Date().toLocaleDateString('es-AR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </div>

      {/* Onboarding checklist — hide only when 100% AND all checklist items done */}
      {!checklistDone && (
        <OnboardingChecklist
          state={checklistState}
          tenantSlug={tenant.slug}
          appUrl={appUrl}
        />
      )}

      {/* Today's metrics */}
      <div>
        <h2 className="mb-3 text-xl font-semibold text-slate-900">Hoy</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            label="Turnos hoy"
            value={String(metrics.bookingsToday)}
            icon={<CalendarCheck className="h-5 w-5" aria-hidden="true" />}
          />
          <MetricCard
            label="Revenue hoy"
            value={formatARS(metrics.revenueTodayCents)}
            icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
            sub="Reservas confirmadas y completadas"
          />
          <MetricCard
            label="Abonados activos"
            value={String(metrics.activeAbonados)}
            icon={<Users className="h-5 w-5" aria-hidden="true" />}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/ src/app/(admin)/dashboard/
git commit -m "feat: add dashboard page with metrics and onboarding checklist"
```

---

## Task 5: PIN Server Actions + PinGate Component

**Files:**
- Create: `src/app/(admin)/actions/pin.ts`
- Create: `src/components/pin-gate.tsx`

- [ ] **Step 1: Write test for PIN actions**

```typescript
// src/app/(admin)/actions/pin.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
  })),
}))
vi.mock('@/modules/auth/pin', () => ({
  verifyPin: vi.fn(),
  verifyPinCookie: vi.fn(() => false),
  buildPinCookie: vi.fn(() => 'mock-cookie'),
  COOKIE_NAME: 'pin_session',
  COOKIE_TTL_MS: 1800000,
}))
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(() => ({
    type: 'staff',
    staffUserId: 'staff-1',
    tenantId: 'tenant-1',
    email: 'test@test.com',
    role: 'admin',
  })),
}))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: vi.fn(() => ({ id: 'tenant-1', settings: { staff_pin_hash: 'hash' } })),
}))

import { verifyPin, verifyPinCookie } from '@/modules/auth/pin'

describe('checkPinSessionAction', () => {
  it('returns false when no cookie', async () => {
    const { checkPinSessionAction } = await import('./pin')
    const result = await checkPinSessionAction()
    expect(result).toBe(false)
  })
})

describe('verifyPinAction', () => {
  it('returns ok:false when PIN invalid', async () => {
    vi.mocked(verifyPin).mockResolvedValueOnce(false)
    const { verifyPinAction } = await import('./pin')
    const result = await verifyPinAction('0000')
    expect(result).toEqual({ ok: false, error: 'PIN incorrecto.' })
  })

  it('returns ok:true when PIN valid', async () => {
    vi.mocked(verifyPin).mockResolvedValueOnce(true)
    const { verifyPinAction } = await import('./pin')
    const result = await verifyPinAction('1234')
    expect(result).toEqual({ ok: true })
  })
})
```

Run: `pnpm test -- pin.test`
Expected: 3 passing.

- [ ] **Step 2: Implement PIN Server Actions**

```typescript
// src/app/(admin)/actions/pin.ts
'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import {
  verifyPin,
  verifyPinCookie,
  buildPinCookie,
  COOKIE_NAME,
  COOKIE_TTL_MS,
} from '@/modules/auth/pin'
import { withTenantContext } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

export async function checkPinSessionAction(): Promise<boolean> {
  const jar = cookies()
  const value = jar.get(COOKIE_NAME)?.value
  return value ? verifyPinCookie(value) : false
}

export type VerifyPinResult = { ok: true } | { ok: false; error: string }

export async function verifyPinAction(pin: string): Promise<VerifyPinResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { ok: false, error: 'Tenant no encontrado.' }

  const settings = tenant.settings as TenantSettings
  const hash = settings.staff_pin_hash ?? null
  if (!hash) return { ok: false, error: 'PIN no configurado. Configuralo en Ajustes → Seguridad.' }

  const ok = await verifyPin(pin, hash)
  if (!ok) return { ok: false, error: 'PIN incorrecto.' }

  const jar = cookies()
  jar.set({
    name: COOKIE_NAME,
    value: buildPinCookie(),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: Math.floor(COOKIE_TTL_MS / 1000),
    path: '/',
  })

  return { ok: true }
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test -- pin.test`
Expected: 3 passing.

- [ ] **Step 4: PinGate Client Component**

```tsx
// src/components/pin-gate.tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkPinSessionAction, verifyPinAction } from '@/app/(admin)/actions/pin'

interface PinGateProps {
  children: ReactNode
}

export function PinGate({ children }: PinGateProps) {
  const [verified, setVerified] = useState<boolean | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    checkPinSessionAction().then(setVerified)
  }, [])

  if (verified === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" aria-label="Verificando..." />
      </div>
    )
  }

  if (verified) return <>{children}</>

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await verifyPinAction(pin)
      if (result.ok) {
        setVerified(true)
      } else {
        setError(result.error)
        setPin('')
      }
    })
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-50">
            <Lock className="h-6 w-6 text-sky-600" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">Zona protegida</h2>
          <p className="text-center text-sm text-slate-500">
            Ingresá el PIN de administrador para continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,8}"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              autoFocus
              autoComplete="current-password"
              className="h-10 text-center text-lg tracking-widest"
            />
            {error && (
              <p className="text-xs text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full bg-sky-700 hover:bg-sky-800" disabled={pin.length < 4}>
            Confirmar
          </Button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck`

```bash
git add src/app/(admin)/actions/pin.ts src/app/(admin)/actions/pin.test.ts src/components/pin-gate.tsx
git commit -m "feat: add PIN session Server Actions and PinGate client component"
```

---

## Task 6: Staff Actions

**Files:**
- Create: `src/app/(admin)/staff/actions.ts`

- [ ] **Step 1: Write integration test**

```typescript
// src/app/(admin)/staff/actions.test.ts
import { describe, expect, it, vi } from 'vitest'

// Integration tests run with real DB (pnpm test:integration).
// Unit tests stub auth + DB.

vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(() => ({
    type: 'staff', staffUserId: 'staff-1', tenantId: 'tenant-1',
    email: 'owner@test.com', role: 'admin',
  })),
}))

describe('deactivateStaffAction', () => {
  it.todo('prevents deactivating last active admin')
  it.todo('deactivates staff and invalidates sessions')
})

describe('inviteStaffAction', () => {
  it.todo('returns error if email already member of this tenant')
  it.todo('creates staff_users + tenant_staff_members + sends invite')
})
```

Run: `pnpm test -- staff/actions.test`
Expected: 4 todo tests, 0 failures.

- [ ] **Step 2: Implement staff actions**

```typescript
// src/app/(admin)/staff/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { and, count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { staffUsers, tenantStaffMembers } from '@/shared/db/schema'
import { createAdminClient } from '@/lib/supabase/admin'

export type StaffActionResult =
  | { success: true }
  | { success: false; error: string }

const inviteSchema = z.object({
  email: z.string().email('Email inválido'),
  firstName: z.string().min(1, 'Nombre requerido').max(100),
  lastName: z.string().min(1, 'Apellido requerido').max(100),
})

async function requireStaffTenant() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  return { user, tenant }
}

export async function inviteStaffAction(
  formData: FormData,
): Promise<StaffActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const { email, firstName, lastName } = parsed.data

  const result = await withTenantContext(tenant.id, async (tx) => {
    // Check if already a member of THIS tenant
    const existing = await tx
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .innerJoin(tenantStaffMembers, eq(tenantStaffMembers.staffUserId, staffUsers.id))
      .where(
        and(
          eq(staffUsers.email, email.toLowerCase()),
          eq(tenantStaffMembers.tenantId, tenant.id),
          eq(tenantStaffMembers.isActive, true),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      return { success: false as const, error: 'Este email ya es miembro activo del complejo.' }
    }

    // Upsert staff_users global record
    const [staffUser] = await tx
      .insert(staffUsers)
      .values({ email: email.toLowerCase(), firstName, lastName })
      .onConflictDoUpdate({
        target: staffUsers.email,
        set: { firstName, lastName },
      })
      .returning({ id: staffUsers.id })

    if (!staffUser) return { success: false as const, error: 'Error creando usuario.' }

    // Create or reactivate tenant_staff_members
    await tx
      .insert(tenantStaffMembers)
      .values({
        tenantId: tenant.id,
        staffUserId: staffUser.id,
        role: 'admin',
        addedBy: user.staffUserId!,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [tenantStaffMembers.tenantId, tenantStaffMembers.staffUserId],
        set: { isActive: true, addedBy: user.staffUserId! },
      })

    // Invite via Supabase (creates auth user + sends email)
    const adminClient = createAdminClient()
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email.toLowerCase(),
      { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard` },
    )

    if (inviteError) {
      // User may already exist in auth — that's OK; they can log in with magic link
      if (!inviteError.message.includes('already been registered')) {
        return { success: false as const, error: `Error enviando invitación: ${inviteError.message}` }
      }
    }

    // Set app_metadata so auth.middleware maps them to this tenant
    if (inviteData?.user?.id) {
      await adminClient.auth.admin.updateUserById(inviteData.user.id, {
        app_metadata: {
          staff_user_id: staffUser.id,
          tenant_id: tenant.id,
          role: 'admin',
        },
      })
    }

    return { success: true as const }
  })

  if (result.success) revalidatePath('/staff')
  return result
}

export async function deactivateStaffAction(
  staffMemberId: string,
): Promise<StaffActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const result = await withTenantContext(tenant.id, async (tx) => {
    // Prevent removing last active admin
    const [activeCount] = await tx
      .select({ value: count() })
      .from(tenantStaffMembers)
      .where(
        and(
          eq(tenantStaffMembers.tenantId, tenant.id),
          eq(tenantStaffMembers.isActive, true),
        ),
      )

    if (Number(activeCount?.value ?? 0) <= 1) {
      return {
        success: false as const,
        error: 'El complejo debe tener al menos un admin activo.',
      }
    }

    const [updated] = await tx
      .update(tenantStaffMembers)
      .set({ isActive: false })
      .where(
        and(
          eq(tenantStaffMembers.id, staffMemberId),
          eq(tenantStaffMembers.tenantId, tenant.id),
        ),
      )
      .returning({ id: tenantStaffMembers.id })

    if (!updated) return { success: false as const, error: 'Miembro no encontrado.' }
    return { success: true as const }
  })

  if (result.success) revalidatePath('/staff')
  return result
}

export async function resendInviteAction(email: string): Promise<StaffActionResult> {
  const { tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
  })

  if (error) return { success: false, error: `Error reenviando invitación: ${error.message}` }
  return { success: true }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors. Note: `createAdminClient` must exist in `src/lib/supabase/admin.ts`. If it uses a different name, update the import.

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/staff/actions.ts src/app/(admin)/staff/actions.test.ts
git commit -m "feat: add staff invite/deactivate/resend server actions"
```

---

## Task 7: Staff Page

**Files:**
- Create: `src/app/(admin)/staff/page.tsx`

- [ ] **Step 1: Build staff page**

```tsx
// src/app/(admin)/staff/page.tsx
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { UserPlus, Mail, MoreHorizontal } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { staffUsers, tenantStaffMembers } from '@/shared/db/schema'
import { PinGate } from '@/components/pin-gate'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { inviteStaffAction, deactivateStaffAction, resendInviteAction } from './actions'

interface StaffMember {
  memberId: string
  staffUserId: string
  firstName: string
  lastName: string
  email: string
  isActive: boolean
  createdAt: Date
}

async function getStaffMembers(tenantId: string): Promise<StaffMember[]> {
  return withTenantContext(tenantId, async (tx) => {
    return tx
      .select({
        memberId: tenantStaffMembers.id,
        staffUserId: staffUsers.id,
        firstName: staffUsers.firstName,
        lastName: staffUsers.lastName,
        email: staffUsers.email,
        isActive: tenantStaffMembers.isActive,
        createdAt: tenantStaffMembers.createdAt,
      })
      .from(tenantStaffMembers)
      .innerJoin(staffUsers, eq(tenantStaffMembers.staffUserId, staffUsers.id))
      .where(eq(tenantStaffMembers.tenantId, tenantId))
      .orderBy(tenantStaffMembers.createdAt)
  })
}

export default async function StaffPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const members = await getStaffMembers(tenant.id)

  return (
    <PinGate>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Equipo</h1>
            <p className="mt-1 text-sm text-slate-500">
              {members.filter((m) => m.isActive).length} admin{members.filter((m) => m.isActive).length !== 1 ? 's' : ''} activo{members.filter((m) => m.isActive).length !== 1 ? 's' : ''}
            </p>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button className="bg-sky-700 hover:bg-sky-800 text-white h-10 px-4 rounded-md text-sm font-medium">
                <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                Agregar admin
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Invitar nuevo admin</DialogTitle>
              </DialogHeader>
              <form action={inviteStaffAction} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">Nombre</Label>
                    <Input id="firstName" name="firstName" required className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Apellido</Label>
                    <Input id="lastName" name="lastName" required className="h-10" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="h-10"
                  />
                  <p className="text-xs text-slate-500">
                    Recibirán un email para activar su cuenta.
                  </p>
                </div>
                <Button type="submit" className="w-full bg-sky-700 hover:bg-sky-800">
                  Enviar invitación
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Estado
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.memberId} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    {m.firstName} {m.lastName}
                    {m.staffUserId === user.staffUserId && (
                      <span className="ml-2 text-xs text-slate-400">(vos)</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{m.email}</td>
                  <td className="px-6 py-4">
                    {m.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {m.staffUserId !== user.staffUserId && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Opciones">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {m.isActive ? (
                            <form action={deactivateStaffAction.bind(null, m.memberId)}>
                              <DropdownMenuItem asChild>
                                <button type="submit" className="w-full cursor-pointer text-left text-red-600">
                                  Desactivar
                                </button>
                              </DropdownMenuItem>
                            </form>
                          ) : (
                            <form action={resendInviteAction.bind(null, m.email)}>
                              <DropdownMenuItem asChild>
                                <button type="submit" className="w-full cursor-pointer text-left">
                                  Reenviar invitación
                                </button>
                              </DropdownMenuItem>
                            </form>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {members.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Mail className="h-8 w-8 text-slate-300" aria-hidden="true" />
              <p className="text-sm text-slate-500">No hay miembros de equipo aún.</p>
            </div>
          )}
        </div>
      </div>
    </PinGate>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(admin)/staff/page.tsx
git commit -m "feat: add staff management page with invite and deactivate"
```

---

## Task 8: Settings — Reservation Policies

**Files:**
- Create: `src/app/(admin)/settings/page.tsx`
- Create: `src/app/(admin)/settings/reservas/actions.ts`
- Create: `src/app/(admin)/settings/reservas/page.tsx`

- [ ] **Step 1: Settings hub redirect**

```typescript
// src/app/(admin)/settings/page.tsx
import { redirect } from 'next/navigation'

export default function SettingsPage() {
  redirect('/settings/reservas')
}
```

- [ ] **Step 2: Reservation policies action**

```typescript
// src/app/(admin)/settings/reservas/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sql, eq } from 'drizzle-orm'
import { z } from 'zod'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { checkPinSessionAction } from '@/app/(admin)/actions/pin'

export type PolicyActionResult =
  | { success: true }
  | { success: false; error: string }

const reservasPolicySchema = z.object({
  requiresDeposit: z.boolean(),
  depositPercentage: z.number().int().min(10).max(100),
  allowOnlineBooking: z.boolean(),
  cancellationHoursBefore: z.number().int().min(0).max(72),
  noShowPenaltyType: z.enum(['none', 'ban_days']),
  noShowPenaltyDays: z.number().int().min(1).max(30),
  noShowPenaltyThreshold: z.number().int().min(1).max(10),
})

export async function updateReservasPolicyAction(
  formData: FormData,
): Promise<PolicyActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const pinOk = await checkPinSessionAction()
  if (!pinOk) return { success: false, error: 'PIN requerido.' }

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const raw = {
    requiresDeposit: formData.get('requiresDeposit') === 'true',
    depositPercentage: Number(formData.get('depositPercentage')),
    allowOnlineBooking: formData.get('allowOnlineBooking') === 'true',
    cancellationHoursBefore: Number(formData.get('cancellationHoursBefore')),
    noShowPenaltyType: formData.get('noShowPenaltyType'),
    noShowPenaltyDays: Number(formData.get('noShowPenaltyDays')),
    noShowPenaltyThreshold: Number(formData.get('noShowPenaltyThreshold')),
  }

  const parsed = reservasPolicySchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const { requiresDeposit, depositPercentage, allowOnlineBooking,
          cancellationHoursBefore, noShowPenaltyType, noShowPenaltyDays,
          noShowPenaltyThreshold } = parsed.data

  const patch = {
    requires_deposit: requiresDeposit,
    deposit_percentage: depositPercentage,
    allow_online_booking: allowOnlineBooking,
    cancellation_policy: {
      hours_before: cancellationHoursBefore,
      penalty_type: 'deposit',
      penalty_amount: null,
    },
    no_show_penalty: {
      type: noShowPenaltyType,
      days: noShowPenaltyDays,
      threshold: noShowPenaltyThreshold,
    },
  }

  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({
        settings: sql`settings || ${JSON.stringify(patch)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/settings/reservas')
  return { success: true }
}
```

- [ ] **Step 3: Reservation policies page**

```tsx
// src/app/(admin)/settings/reservas/page.tsx
import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { PinGate } from '@/components/pin-gate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateReservasPolicyAction } from './actions'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

export default async function ReservasPolicyPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const s = tenant.settings as TenantSettings

  return (
    <PinGate>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>
        </div>

        {/* Settings nav tabs */}
        <nav className="flex gap-1 border-b border-slate-200">
          {[
            { href: '/settings/reservas', label: 'Reservas' },
            { href: '/settings/horarios', label: 'Horarios' },
            { href: '/settings/pin', label: 'Seguridad' },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="border-b-2 border-sky-600 px-4 py-2 text-sm font-medium text-sky-700 first-of-type:border-sky-600"
              style={href !== '/settings/reservas' ? { borderColor: 'transparent', color: '#64748b' } : {}}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-6 text-base font-semibold text-slate-900">Políticas de Reserva</h2>

          <form action={updateReservasPolicyAction} className="space-y-6 max-w-lg">
            {/* Seña */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-slate-700">Seña</legend>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="requiresDeposit"
                    value="true"
                    defaultChecked={s.requires_deposit !== false}
                    className="accent-sky-700"
                  />
                  Requerir seña
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="requiresDeposit"
                    value="false"
                    defaultChecked={s.requires_deposit === false}
                    className="accent-sky-700"
                  />
                  Sin seña
                </label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="depositPercentage">Porcentaje de seña (%)</Label>
                <Input
                  id="depositPercentage"
                  name="depositPercentage"
                  type="number"
                  min={10}
                  max={100}
                  defaultValue={s.deposit_percentage ?? 30}
                  className="h-10 w-32"
                />
                <p className="text-xs text-slate-500">Entre 10% y 100%</p>
              </div>
            </fieldset>

            {/* Online booking */}
            <div className="space-y-1.5">
              <Label>Reservas online</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="allowOnlineBooking"
                    value="true"
                    defaultChecked={s.allow_online_booking !== false}
                    className="accent-sky-700"
                  />
                  Habilitadas
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="allowOnlineBooking"
                    value="false"
                    defaultChecked={s.allow_online_booking === false}
                    className="accent-sky-700"
                  />
                  Deshabilitadas
                </label>
              </div>
            </div>

            {/* Cancellation */}
            <div className="space-y-1.5">
              <Label htmlFor="cancellationHoursBefore">Anticipación mínima para cancelar (horas)</Label>
              <Input
                id="cancellationHoursBefore"
                name="cancellationHoursBefore"
                type="number"
                min={0}
                max={72}
                defaultValue={s.cancellation_policy?.hours_before ?? 12}
                className="h-10 w-32"
              />
              <p className="text-xs text-slate-500">0 = sin límite de anticipación</p>
            </div>

            {/* No-show penalty */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-slate-700">Penalidad por no-show</legend>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="noShowPenaltyType"
                    value="ban_days"
                    defaultChecked={(s.no_show_penalty?.type ?? 'ban_days') === 'ban_days'}
                    className="accent-sky-700"
                  />
                  Ban temporal
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="noShowPenaltyType"
                    value="none"
                    defaultChecked={s.no_show_penalty?.type === 'none'}
                    className="accent-sky-700"
                  />
                  Sin penalidad
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="noShowPenaltyThreshold">No-shows para aplicar ban</Label>
                  <Input
                    id="noShowPenaltyThreshold"
                    name="noShowPenaltyThreshold"
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={s.no_show_penalty?.threshold ?? 2}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="noShowPenaltyDays">Días de ban</Label>
                  <Input
                    id="noShowPenaltyDays"
                    name="noShowPenaltyDays"
                    type="number"
                    min={1}
                    max={30}
                    defaultValue={s.no_show_penalty?.days ?? 7}
                    className="h-10"
                  />
                </div>
              </div>
            </fieldset>

            <Button type="submit" className="bg-sky-700 hover:bg-sky-800 text-white h-10 px-4 rounded-md text-sm font-medium">
              Guardar cambios
            </Button>
          </form>
        </div>
      </div>
    </PinGate>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors. Ensure `TenantSettings` includes `no_show_penalty.threshold?: number` and `public_link_shared?: boolean`.

- [ ] **Step 5: Commit**

```bash
git add src/app/(admin)/settings/
git commit -m "feat: add settings hub and reservation policies page (PIN-gated)"
```

---

## Task 9: Settings — Operating Hours

**Files:**
- Create: `src/app/(admin)/settings/horarios/actions.ts`
- Create: `src/app/(admin)/settings/horarios/page.tsx`

- [ ] **Step 1: Horarios action**

```typescript
// src/app/(admin)/settings/horarios/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { checkPinSessionAction } from '@/app/(admin)/actions/pin'

export type HorariosActionResult =
  | { success: true }
  | { success: false; error: string }

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/

const daySchema = z.object({
  open: z.string().regex(timeRegex, 'Formato HH:MM'),
  close: z.string().regex(timeRegex, 'Formato HH:MM'),
})

const horariosSchema = z.object({
  mon: daySchema,
  tue: daySchema,
  wed: daySchema,
  thu: daySchema,
  fri: daySchema,
  sat: daySchema,
  sun: daySchema,
})

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export async function updateHorariosAction(
  formData: FormData,
): Promise<HorariosActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const pinOk = await checkPinSessionAction()
  if (!pinOk) return { success: false, error: 'PIN requerido.' }

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const raw = Object.fromEntries(
    DAYS.map((day) => [
      day,
      {
        open: formData.get(`${day}_open`) as string,
        close: formData.get(`${day}_close`) as string,
      },
    ]),
  )

  const parsed = horariosSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Horarios inválidos.' }
  }

  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({ openingHours: parsed.data, updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/settings/horarios')
  return { success: true }
}

export async function addClosedDateAction(date: string): Promise<HorariosActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const pinOk = await checkPinSessionAction()
  if (!pinOk) return { success: false, error: 'PIN requerido.' }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { success: false, error: 'Fecha inválida.' }
  }

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({
        closedDates: [...(tenant.closedDates ?? []), date as unknown as Date],
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/settings/horarios')
  return { success: true }
}

export async function removeClosedDateAction(date: string): Promise<HorariosActionResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const pinOk = await checkPinSessionAction()
  if (!pinOk) return { success: false, error: 'PIN requerido.' }

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const filtered = (tenant.closedDates ?? []).filter((d) => String(d) !== date)

  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({ closedDates: filtered, updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/settings/horarios')
  return { success: true }
}
```

- [ ] **Step 2: Horarios page**

```tsx
// src/app/(admin)/settings/horarios/page.tsx
import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { PinGate } from '@/components/pin-gate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateHorariosAction, removeClosedDateAction } from './actions'

const DAY_LABELS: Record<string, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves',
  fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
}
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

type OpeningHours = Record<string, { open: string; close: string }>

export default async function HorariosPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const hours = tenant.openingHours as OpeningHours
  const closedDates = (tenant.closedDates ?? []) as unknown as string[]

  return (
    <PinGate>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>
        </div>

        <nav className="flex gap-1 border-b border-slate-200">
          {[
            { href: '/settings/reservas', label: 'Reservas' },
            { href: '/settings/horarios', label: 'Horarios' },
            { href: '/settings/pin', label: 'Seguridad' },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="px-4 py-2 text-sm font-medium transition-colors duration-150"
              style={
                href === '/settings/horarios'
                  ? { borderBottom: '2px solid #0369A1', color: '#0369A1' }
                  : { borderBottom: '2px solid transparent', color: '#64748b' }
              }
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-6 text-base font-semibold text-slate-900">Horarios de apertura</h2>
          <form action={updateHorariosAction} className="space-y-3">
            <div className="grid grid-cols-[8rem_1fr_1fr] items-center gap-x-4 gap-y-3">
              <div />
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Apertura</p>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cierre</p>

              {DAYS.map((day) => (
                <>
                  <Label key={`${day}-label`} className="text-sm text-slate-700">
                    {DAY_LABELS[day]}
                  </Label>
                  <Input
                    key={`${day}-open`}
                    name={`${day}_open`}
                    type="time"
                    defaultValue={hours[day]?.open ?? '08:00'}
                    className="h-10 w-32"
                  />
                  <Input
                    key={`${day}-close`}
                    name={`${day}_close`}
                    type="time"
                    defaultValue={hours[day]?.close ?? '00:00'}
                    className="h-10 w-32"
                  />
                </>
              ))}
            </div>
            <div className="pt-2">
              <Button type="submit" className="bg-sky-700 hover:bg-sky-800 text-white h-10 px-4 rounded-md text-sm font-medium">
                Guardar horarios
              </Button>
            </div>
          </form>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Días cerrados</h2>

          {closedDates.length > 0 ? (
            <ul className="mb-4 space-y-2">
              {closedDates.sort().map((date) => (
                <li key={date} className="flex items-center justify-between rounded-md border border-slate-100 px-4 py-2">
                  <span className="text-sm text-slate-700">
                    {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </span>
                  <form action={removeClosedDateAction.bind(null, date)}>
                    <Button variant="ghost" size="sm" type="submit" className="text-red-600 hover:text-red-700">
                      Quitar
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-slate-500">No hay días cerrados configurados.</p>
          )}

          <form action={addClosedDateAction} className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="closedDate">Agregar día cerrado</Label>
              <Input
                id="closedDate"
                name="0"
                type="date"
                className="h-10 w-48"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <Button type="submit" variant="outline" className="h-10">
              Agregar
            </Button>
          </form>
        </div>
      </div>
    </PinGate>
  )
}
```

Note: `addClosedDateAction` above takes a `string` arg but is used as `action={addClosedDateAction}` with form. Adjust to read from `FormData`:

```typescript
// Fix: update signature to take FormData
export async function addClosedDateAction(formData: FormData): Promise<HorariosActionResult> {
  const date = formData.get('0') as string
  // ... rest of implementation
}
```

And in the page, update the form accordingly (no `.bind`).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/settings/horarios/
git commit -m "feat: add operating hours settings page (PIN-gated)"
```

---

## Task 10: Settings — PIN Config

**Files:**
- Create: `src/app/(admin)/settings/pin/actions.ts`
- Create: `src/app/(admin)/settings/pin/page.tsx`

- [ ] **Step 1: PIN config action**

```typescript
// src/app/(admin)/settings/pin/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sql, eq } from 'drizzle-orm'
import { z } from 'zod'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { hashPin, verifyPin } from '@/modules/auth/pin'
import { checkPinSessionAction } from '@/app/(admin)/actions/pin'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

export type PinConfigResult =
  | { success: true }
  | { success: false; error: string }

const pinSchema = z.object({
  currentPin: z.string().min(4).max(8).regex(/^\d+$/, 'El PIN debe ser numérico'),
  newPin: z.string().min(4).max(8).regex(/^\d+$/, 'El PIN debe ser numérico'),
  confirmPin: z.string(),
}).refine((d) => d.newPin === d.confirmPin, {
  message: 'Los PINes no coinciden.',
  path: ['confirmPin'],
})

const setPinSchema = z.object({
  newPin: z.string().min(4).max(8).regex(/^\d+$/, 'El PIN debe ser numérico'),
  confirmPin: z.string(),
}).refine((d) => d.newPin === d.confirmPin, {
  message: 'Los PINes no coinciden.',
  path: ['confirmPin'],
})

export async function setPinAction(formData: FormData): Promise<PinConfigResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const pinOk = await checkPinSessionAction()
  if (!pinOk) return { success: false, error: 'PIN requerido.' }

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const settings = tenant.settings as TenantSettings
  const hasExistingPin = !!settings.staff_pin_hash

  if (hasExistingPin) {
    const parsed = pinSchema.safeParse({
      currentPin: formData.get('currentPin'),
      newPin: formData.get('newPin'),
      confirmPin: formData.get('confirmPin'),
    })
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
    }

    const currentOk = await verifyPin(parsed.data.currentPin, settings.staff_pin_hash!)
    if (!currentOk) return { success: false, error: 'PIN actual incorrecto.' }

    const newHash = await hashPin(parsed.data.newPin)
    await _savePinHash(tenant.id, newHash)
  } else {
    const parsed = setPinSchema.safeParse({
      newPin: formData.get('newPin'),
      confirmPin: formData.get('confirmPin'),
    })
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
    }

    const newHash = await hashPin(parsed.data.newPin)
    await _savePinHash(tenant.id, newHash)
  }

  revalidatePath('/settings/pin')
  return { success: true }
}

async function _savePinHash(tenantId: string, hash: string): Promise<void> {
  await withTenantContext(tenantId, async (tx) => {
    await tx
      .update(tenants)
      .set({
        settings: sql`settings || ${JSON.stringify({ staff_pin_hash: hash })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
  })
}
```

- [ ] **Step 2: PIN config page**

```tsx
// src/app/(admin)/settings/pin/page.tsx
import { redirect } from 'next/navigation'
import { Shield } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { PinGate } from '@/components/pin-gate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setPinAction } from './actions'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

export default async function PinSettingsPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const settings = tenant.settings as TenantSettings
  const hasPin = !!settings.staff_pin_hash

  return (
    <PinGate>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>
        </div>

        <nav className="flex gap-1 border-b border-slate-200">
          {[
            { href: '/settings/reservas', label: 'Reservas' },
            { href: '/settings/horarios', label: 'Horarios' },
            { href: '/settings/pin', label: 'Seguridad' },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="px-4 py-2 text-sm font-medium transition-colors duration-150"
              style={
                href === '/settings/pin'
                  ? { borderBottom: '2px solid #0369A1', color: '#0369A1' }
                  : { borderBottom: '2px solid transparent', color: '#64748b' }
              }
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50">
              <Shield className="h-5 w-5 text-sky-600" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {hasPin ? 'Cambiar PIN de administrador' : 'Configurar PIN de administrador'}
              </h2>
              <p className="text-xs text-slate-500">
                {hasPin
                  ? 'El PIN protege precios, configuración y gestión de equipo.'
                  : 'Sin PIN configurado, las zonas sensibles no están protegidas.'}
              </p>
            </div>
          </div>

          <form action={setPinAction} className="space-y-4">
            {hasPin && (
              <div className="space-y-1.5">
                <Label htmlFor="currentPin">PIN actual</Label>
                <Input
                  id="currentPin"
                  name="currentPin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4,8}"
                  autoComplete="current-password"
                  className="h-10"
                  placeholder="••••"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="newPin">Nuevo PIN</Label>
              <Input
                id="newPin"
                name="newPin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                autoComplete="new-password"
                className="h-10"
                placeholder="••••"
              />
              <p className="text-xs text-slate-500">4 a 8 dígitos numéricos.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPin">Confirmar nuevo PIN</Label>
              <Input
                id="confirmPin"
                name="confirmPin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                autoComplete="new-password"
                className="h-10"
                placeholder="••••"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-sky-700 hover:bg-sky-800 text-white h-10 rounded-md text-sm font-medium"
            >
              {hasPin ? 'Cambiar PIN' : 'Configurar PIN'}
            </Button>
          </form>

          {!hasPin && (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <strong>Recomendado:</strong> Configurá un PIN antes de dar acceso a empleados.
            </p>
          )}
        </div>
      </div>
    </PinGate>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/settings/pin/
git commit -m "feat: add PIN configuration settings page"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: 0 errors across all new files.

- [ ] **Step 2: Design system checklist**

Verify against `design-system/MASTER.md §12`:
- [ ] All colors use palette tokens (slate-*, sky-*, green-*, amber-*, red-*) — no raw hex in JSX
- [ ] `tabular-nums` on metrics values in `MetricCard`
- [ ] `cursor-pointer` on all nav links and interactive non-button elements
- [ ] All inputs have visible `<Label>` above
- [ ] Focus states: shadcn/ui provides `focus-visible:ring-2` by default
- [ ] Lucide icons only — no emojis
- [ ] Button loading/disabled state: PIN submit button disables when `pin.length < 4`
- [ ] Responsive: sidebar collapses to mobile sheet on < lg

- [ ] **Step 3: E2E acceptance**

Manual path to verify: registration → onboarding wizard → land on `/dashboard` → checklist visible → all items clickable → metrics show 0s → navigate sidebar → `/staff` shows PIN gate → enter PIN → see staff list → `/settings/reservas` shows PIN gate.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete admin dashboard and settings implementation"
```

---

## Spec Coverage Verification

| Requirement | Task |
|---|---|
| US-ONB-003: Checklist con 7 ítems, progreso, aha moment | Task 4 |
| US-ONB-003: Copiar link público marca ítem como done | Task 4 (markPublicLinkSharedAction) |
| US-ADM-003: Staff CRUD con validación "al menos 1 admin" | Task 6-7 |
| US-ADM-002: Políticas de reserva (seña, cancelación, no-show) | Task 8 |
| US-ADM-005: Horarios operativos + días cerrados | Task 9 |
| Sidebar con 9 nav items + lock icons en zonas PIN | Task 1 |
| Banner trial: días restantes + CTA "Elegir plan" | Task 1 |
| Banner past_due: fecha límite + "Actualizar pago" | Task 1 |
| Banner service_degraded: env var NEXT_PUBLIC_SERVICE_DEGRADED | Task 1 |
| PinGate: modal 30-min session cookie | Task 5 |
| Zonas PIN: staff, settings/*, canchas (via existing PIN middleware) | Tasks 5, 7, 8, 9, 10 |
| Design tokens: slate/sky palette, Inter, 4px grid | All tasks |
