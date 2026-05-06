# Reportes Financieros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement US-CAJ-005 — monthly revenue reports with court/method breakdown, month navigation, and CSV export.

**Architecture:** Server Component (`/reportes`) fetches via `getRevenueReport()` → pure Drizzle aggregation inside `withTenantContext`. Route Handler (`/api/reports/revenue`) handles CSV download only. Month navigation via plain GET `<form>` submits — no client components needed.

**Tech Stack:** Drizzle ORM, Vitest, Next.js 14 App Router Server Components, Tailwind CSS

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/modules/reports/report.types.ts` | Create | TypeScript types: `RevenueReport`, `CourtReport`, `MethodReport`, `CashFlowExportRow` |
| `src/modules/reports/report.utils.ts` | Create | Pure functions: `getMonthBounds`, `prevMonthStr`, `formatMonthLabel`, `calcAvailableMinutes`, `calcOccupancyPct`, `toCsv` |
| `tests/unit/reports.test.ts` | Create | Unit tests for all utils |
| `src/modules/reports/report.service.ts` | Create | `getRevenueReport()` + `getCashFlowsForExport()` |
| `tests/integration/reports.test.ts` | Create | Integration tests for service functions |
| `src/app/(admin)/reportes/page.tsx` | Create | Server Component: KPI cards, court/method tables, CSV link |
| `src/app/(admin)/reportes/error.tsx` | Create | `'use client'` error boundary |
| `src/app/api/reports/revenue/route.ts` | Create | `GET` handler: auth + CSV stream |

---

## Task 1: Types + Utils + Unit Tests

**Files:**
- Create: `src/modules/reports/report.types.ts`
- Create: `src/modules/reports/report.utils.ts`
- Test: `tests/unit/reports.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/reports.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  getMonthBounds,
  prevMonthStr,
  formatMonthLabel,
  calcAvailableMinutes,
  calcOccupancyPct,
  toCsv,
} from '@/modules/reports/report.utils'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

const ALL_DAY_HOURS: OpeningHours = {
  mon: { open: '08:00', close: '00:00' },
  tue: { open: '08:00', close: '00:00' },
  wed: { open: '08:00', close: '00:00' },
  thu: { open: '08:00', close: '00:00' },
  fri: { open: '08:00', close: '00:00' },
  sat: { open: '08:00', close: '00:00' },
  sun: { open: '08:00', close: '00:00' },
}

const CLOSED_MONDAYS: OpeningHours = {
  ...ALL_DAY_HOURS,
  mon: { open: '08:00', close: '00:00', closed: true },
}

describe('getMonthBounds', () => {
  it('returns UTC midnight for first and next month', () => {
    const { from, to } = getMonthBounds('2026-05')
    expect(from.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(to.toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })

  it('handles December → January year boundary', () => {
    const { from, to } = getMonthBounds('2026-12')
    expect(from.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(to.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})

describe('prevMonthStr', () => {
  it('returns previous month', () => {
    expect(prevMonthStr('2026-05')).toBe('2026-04')
  })

  it('wraps January to previous year December', () => {
    expect(prevMonthStr('2026-01')).toBe('2025-12')
  })
})

describe('formatMonthLabel', () => {
  it('returns a non-empty string containing the year', () => {
    const label = formatMonthLabel('2026-05')
    expect(label).toContain('2026')
    expect(label.length).toBeGreaterThan(4)
  })
})

describe('calcAvailableMinutes', () => {
  // 08:00 to 00:00 = 960 minutes per day
  it('returns 960 × 7 for a full week with 1 court', () => {
    // 2026-05-04 (Mon) to 2026-05-11 (Mon) = 7 days
    const from = new Date('2026-05-04T00:00:00.000Z')
    const to = new Date('2026-05-11T00:00:00.000Z')
    expect(calcAvailableMinutes(from, to, ALL_DAY_HOURS, 1)).toBe(7 * 960)
  })

  it('skips days with closed: true', () => {
    const from = new Date('2026-05-04T00:00:00.000Z') // Monday
    const to = new Date('2026-05-11T00:00:00.000Z')
    // 1 Monday skipped → 6 open days
    expect(calcAvailableMinutes(from, to, CLOSED_MONDAYS, 1)).toBe(6 * 960)
  })

  it('scales linearly with courtCount', () => {
    const from = new Date('2026-05-04T00:00:00.000Z')
    const to = new Date('2026-05-05T00:00:00.000Z')
    expect(calcAvailableMinutes(from, to, ALL_DAY_HOURS, 3)).toBe(960 * 3)
  })

  it('returns 0 when courtCount is 0', () => {
    const from = new Date('2026-05-04T00:00:00.000Z')
    const to = new Date('2026-05-05T00:00:00.000Z')
    expect(calcAvailableMinutes(from, to, ALL_DAY_HOURS, 0)).toBe(0)
  })

  it('returns 0 for same from and to', () => {
    const d = new Date('2026-05-04T00:00:00.000Z')
    expect(calcAvailableMinutes(d, d, ALL_DAY_HOURS, 2)).toBe(0)
  })
})

describe('calcOccupancyPct', () => {
  it('returns 0 when availableMinutes is 0', () => {
    expect(calcOccupancyPct(500, 0)).toBe(0)
  })

  it('returns 100 when fully booked', () => {
    expect(calcOccupancyPct(960, 960)).toBe(100)
  })

  it('returns 50 for half occupancy', () => {
    expect(calcOccupancyPct(480, 960)).toBe(50)
  })

  it('rounds to 1 decimal place', () => {
    expect(calcOccupancyPct(1, 3)).toBe(33.3)
  })
})

describe('toCsv', () => {
  it('returns empty string for empty array', () => {
    expect(toCsv([])).toBe('')
  })

  it('writes header row and data row', () => {
    const csv = toCsv([{ fecha: '2026-05-01', monto: 1000 }])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('fecha,monto')
    expect(lines[1]).toBe('2026-05-01,1000')
  })

  it('wraps values containing commas in double quotes', () => {
    const csv = toCsv([{ desc: 'hola, mundo' }])
    expect(csv).toContain('"hola, mundo"')
  })

  it('escapes embedded double quotes as double-double-quotes', () => {
    const csv = toCsv([{ desc: 'say "hi"' }])
    expect(csv).toContain('"say ""hi"""')
  })

  it('handles null and undefined values as empty strings', () => {
    const csv = toCsv([{ a: null, b: undefined }])
    const dataLine = csv.split('\r\n')[1]
    expect(dataLine).toBe(',')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/reports.test.ts
```

Expected output: `Error: Cannot find module '@/modules/reports/report.utils'`

- [ ] **Step 3: Create types file**

Create `src/modules/reports/report.types.ts`:

```ts
export type PaymentMethod = 'cash' | 'transfer' | 'mercadopago' | 'other'

export type CourtReport = {
  courtId: string
  courtName: string
  income: number
  bookingCount: number
  occupancyPct: number
}

export type MethodReport = {
  method: PaymentMethod
  total: number
}

export type PeriodTotals = {
  income: number
  adjustment: number
  balance: number
}

export type RevenueReport = {
  period: { from: Date; to: Date }
  income: number
  adjustment: number
  balance: number
  bookingCount: number
  byCourt: CourtReport[]
  byMethod: MethodReport[]
  prevPeriod: PeriodTotals | null
}

export type CashFlowExportRow = {
  fecha: string
  tipo: string
  categoria: string
  monto_ars: number
  metodo: string
  descripcion: string
  cancha: string
}
```

- [ ] **Step 4: Create utils file**

Create `src/modules/reports/report.utils.ts`:

```ts
import type { OpeningHours } from '@/modules/tenants/tenant.types'

// Matches getUTCDay() — 0=Sunday, 1=Monday, ..., 6=Saturday
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type DayKey = (typeof DAY_KEYS)[number]

/** Returns UTC midnight for the first day of `month` (YYYY-MM) and the first day of the next month. */
export function getMonthBounds(month: string): { from: Date; to: Date } {
  const [year, mon] = month.split('-').map(Number)
  return {
    from: new Date(Date.UTC(year, mon - 1, 1)),
    to: new Date(Date.UTC(year, mon, 1)),
  }
}

/** Returns "YYYY-MM" for the month before the given month string. */
export function prevMonthStr(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(Date.UTC(year, mon - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Returns "YYYY-MM" for the month after the given month string. */
export function nextMonthStr(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(Date.UTC(year, mon, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Returns a Spanish locale label like "mayo 2026". */
export function formatMonthLabel(month: string): string {
  const { from } = getMonthBounds(month)
  return from.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Total available booking minutes in [from, to) across courtCount courts.
 * Uses tenant opening hours per day-of-week. close='00:00' means midnight (1440 min).
 * Days with `closed: true` or zero-length windows contribute 0 minutes.
 */
export function calcAvailableMinutes(
  from: Date,
  to: Date,
  openingHours: OpeningHours,
  courtCount: number,
): number {
  if (courtCount === 0) return 0
  let totalPerCourt = 0
  const cursor = new Date(from)
  while (cursor < to) {
    const dayKey = DAY_KEYS[cursor.getUTCDay()] as DayKey
    const hours = openingHours[dayKey]
    if (hours && !hours.closed) {
      const [openH, openM] = hours.open.split(':').map(Number)
      const [closeH, closeM] = hours.close.split(':').map(Number)
      const openMins = openH * 60 + openM
      // '00:00' close means midnight of next day = 1440 total minutes
      const closeMins = closeH === 0 && closeM === 0 ? 24 * 60 : closeH * 60 + closeM
      totalPerCourt += Math.max(0, closeMins - openMins)
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return totalPerCourt * courtCount
}

/** Returns occupancy as a 0–100 number rounded to 1 decimal. Returns 0 if availableMinutes is 0. */
export function calcOccupancyPct(bookedMinutes: number, availableMinutes: number): number {
  if (availableMinutes === 0) return 0
  return Math.round((bookedMinutes / availableMinutes) * 1000) / 10
}

/** Converts an array of objects to an RFC 4180 CSV string. Returns '' for empty input. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown): string => {
    const s = String(v ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ].join('\r\n')
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test tests/unit/reports.test.ts
```

Expected: all 17 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/reports/report.types.ts src/modules/reports/report.utils.ts tests/unit/reports.test.ts
git commit -m "feat: add report types, utils, and unit tests"
```

---

## Task 2: Report Service + Integration Tests

**Files:**
- Create: `src/modules/reports/report.service.ts`
- Test: `tests/integration/reports.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/reports.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { getRevenueReport, getCashFlowsForExport } from '@/modules/reports/report.service'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

const OPENING_HOURS: OpeningHours = {
  mon: { open: '08:00', close: '00:00' },
  tue: { open: '08:00', close: '00:00' },
  wed: { open: '08:00', close: '00:00' },
  thu: { open: '08:00', close: '00:00' },
  fri: { open: '08:00', close: '00:00' },
  sat: { open: '08:00', close: '00:00' },
  sun: { open: '08:00', close: '00:00' },
}

const MAY_FROM = new Date('2026-05-01T00:00:00.000Z')
const MAY_TO = new Date('2026-06-01T00:00:00.000Z')
const APR_FROM = new Date('2026-04-01T00:00:00.000Z')
const APR_TO = new Date('2026-05-01T00:00:00.000Z')

let tenantId: string
let staffId: string

beforeAll(async () => {
  await ensureRoles()
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  tenantId = tenant.id
  const staff = await createTestStaffUser(sql)
  staffId = staff.id
  await linkStaffToTenant(sql, tenantId, staffId)

  // Insert an online court
  await sql`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId},
      ${'Cancha Reporte Test'},
      ${10},
      ${sql.json({
        rules: [{
          days: ['mon','tue','wed','thu','fri','sat','sun'],
          from: '08:00', to: '23:00',
          prices: { '60': 800000, '120': 1500000 },
        }],
      })},
      'online'
    )
  `
})

afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('getRevenueReport — empty period', () => {
  it('returns all zeros with null prevPeriod when no data', async () => {
    const report = await getRevenueReport(tenantId, MAY_FROM, MAY_TO, OPENING_HOURS, APR_FROM, APR_TO)
    expect(report.income).toBe(0)
    expect(report.adjustment).toBe(0)
    expect(report.balance).toBe(0)
    expect(report.bookingCount).toBe(0)
    expect(report.byCourt).toEqual([])
    expect(report.byMethod).toEqual([])
    expect(report.prevPeriod).toBeNull()
  })
})

describe('getRevenueReport — with data', () => {
  beforeAll(async () => {
    const sql = getSql()
    await sql`
      INSERT INTO cash_flows
        (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
      VALUES
        (${tenantId}, 'income',     'other', ${60000}, 'cash',     ${'Efectivo Mayo'},    ${staffId}, ${'2026-05-10T10:00:00Z'}),
        (${tenantId}, 'income',     'other', ${40000}, 'transfer', ${'Transfer Mayo'},     ${staffId}, ${'2026-05-15T12:00:00Z'}),
        (${tenantId}, 'adjustment', 'other', ${5000},  'cash',     ${'Ajuste Mayo'},       ${staffId}, ${'2026-05-20T09:00:00Z'}),
        (${tenantId}, 'income',     'other', ${20000}, 'cash',     ${'Efectivo Abril'},    ${staffId}, ${'2026-04-15T10:00:00Z'})
    `
  })

  it('sums income and adjustment correctly', async () => {
    const report = await getRevenueReport(tenantId, MAY_FROM, MAY_TO, OPENING_HOURS, APR_FROM, APR_TO)
    expect(report.income).toBe(100000)
    expect(report.adjustment).toBe(5000)
    expect(report.balance).toBe(105000)
  })

  it('groups by payment method', async () => {
    const report = await getRevenueReport(tenantId, MAY_FROM, MAY_TO, OPENING_HOURS, APR_FROM, APR_TO)
    const cash = report.byMethod.find((m) => m.method === 'cash')
    const transfer = report.byMethod.find((m) => m.method === 'transfer')
    expect(cash?.total).toBe(65000)   // 60000 income + 5000 adjustment
    expect(transfer?.total).toBe(40000)
  })

  it('returns prevPeriod when April has data', async () => {
    const report = await getRevenueReport(tenantId, MAY_FROM, MAY_TO, OPENING_HOURS, APR_FROM, APR_TO)
    expect(report.prevPeriod).not.toBeNull()
    expect(report.prevPeriod?.income).toBe(20000)
    expect(report.prevPeriod?.balance).toBe(20000)
  })

  it('returns null prevPeriod when prev period is empty', async () => {
    const JAN_FROM = new Date('2026-01-01T00:00:00.000Z')
    const JAN_TO = new Date('2026-02-01T00:00:00.000Z')
    const DEC_FROM = new Date('2025-12-01T00:00:00.000Z')
    const DEC_TO = new Date('2026-01-01T00:00:00.000Z')
    const report = await getRevenueReport(tenantId, JAN_FROM, JAN_TO, OPENING_HOURS, DEC_FROM, DEC_TO)
    expect(report.prevPeriod).toBeNull()
  })
})

describe('getCashFlowsForExport', () => {
  it('returns rows with correct shape', async () => {
    const rows = await getCashFlowsForExport(tenantId, MAY_FROM, MAY_TO)
    expect(rows.length).toBeGreaterThan(0)
    const row = rows[0]
    expect(typeof row.fecha).toBe('string')
    expect(row.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof row.monto_ars).toBe('number')
    expect(row).toHaveProperty('tipo')
    expect(row).toHaveProperty('categoria')
    expect(row).toHaveProperty('metodo')
    expect(row).toHaveProperty('descripcion')
    expect(row).toHaveProperty('cancha')
  })

  it('returns empty array for period with no data', async () => {
    const rows = await getCashFlowsForExport(
      tenantId,
      new Date('2027-01-01T00:00:00.000Z'),
      new Date('2027-02-01T00:00:00.000Z'),
    )
    expect(rows).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:integration tests/integration/reports.test.ts
```

Expected output: `Cannot find module '@/modules/reports/report.service'`

- [ ] **Step 3: Implement report.service.ts**

Create `src/modules/reports/report.service.ts`:

```ts
import { and, eq, isNotNull, lt, gte, sql } from 'drizzle-orm'
import { withTenantContext } from '@/shared/db/client'
import { cashFlows, bookings, courts } from '@/shared/db/schema'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type {
  RevenueReport,
  CourtReport,
  MethodReport,
  PeriodTotals,
  CashFlowExportRow,
} from './report.types'
import { calcAvailableMinutes, calcOccupancyPct } from './report.utils'

type PeriodAgg = {
  income: number
  adjustment: number
  byMethod: MethodReport[]
  byCourt: {
    courtId: string
    courtName: string
    income: number
    bookingCount: number
    bookedMinutes: number
  }[]
  bookingCount: number
  courtCount: number
}

async function fetchPeriodAgg(tenantId: string, from: Date, to: Date): Promise<PeriodAgg> {
  const fromStr = from.toISOString().split('T')[0]  // 'YYYY-MM-DD'
  const toStr = to.toISOString().split('T')[0]      // 'YYYY-MM-DD' (exclusive)

  return withTenantContext(tenantId, async (tx) => {
    const [typeRows, courtRows, bookingCountRows, courtCountRows] = await Promise.all([
      // Q1: sum amounts grouped by cashflow type + payment method
      tx
        .select({
          type: cashFlows.type,
          method: cashFlows.method,
          total: sql<number>`CAST(COALESCE(SUM(${cashFlows.amount}), 0) AS INTEGER)`,
        })
        .from(cashFlows)
        .where(and(gte(cashFlows.occurredAt, from), lt(cashFlows.occurredAt, to)))
        .groupBy(cashFlows.type, cashFlows.method),

      // Q2: income + booked minutes per court (only booking-linked cash flows)
      tx
        .select({
          courtId: courts.id,
          courtName: courts.name,
          income: sql<number>`CAST(COALESCE(SUM(${cashFlows.amount}), 0) AS INTEGER)`,
          bookingCount: sql<number>`CAST(COUNT(DISTINCT ${cashFlows.bookingId}) AS INTEGER)`,
          bookedMinutes: sql<number>`CAST(COALESCE(
            SUM(EXTRACT(EPOCH FROM (${bookings.timeEnd}::time - ${bookings.timeStart}::time)) / 60),
            0
          ) AS INTEGER)`,
        })
        .from(cashFlows)
        .innerJoin(bookings, eq(cashFlows.bookingId, bookings.id))
        .innerJoin(courts, eq(bookings.courtId, courts.id))
        .where(
          and(
            gte(cashFlows.occurredAt, from),
            lt(cashFlows.occurredAt, to),
            isNotNull(cashFlows.bookingId),
          ),
        )
        .groupBy(courts.id, courts.name),

      // Q3: total booking count (all non-canceled statuses)
      tx
        .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
        .from(bookings)
        .where(
          sql`${bookings.date} >= ${fromStr}::date
            AND ${bookings.date} < ${toStr}::date
            AND ${bookings.status} IN ('confirmed', 'completed', 'no_show')`,
        ),

      // Q4: number of online courts (for occupancy denominator)
      tx
        .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
        .from(courts)
        .where(eq(courts.status, 'online')),
    ])

    const income = typeRows
      .filter((r) => r.type === 'income')
      .reduce((acc, r) => acc + r.total, 0)

    const adjustment = typeRows
      .filter((r) => r.type === 'adjustment')
      .reduce((acc, r) => acc + r.total, 0)

    const methodMap = new Map<string, number>()
    for (const r of typeRows) {
      methodMap.set(r.method, (methodMap.get(r.method) ?? 0) + r.total)
    }
    const byMethod: MethodReport[] = Array.from(methodMap.entries())
      .filter(([, total]) => total > 0)
      .map(([method, total]) => ({ method: method as MethodReport['method'], total }))

    return {
      income,
      adjustment,
      byMethod,
      byCourt: courtRows,
      bookingCount: bookingCountRows[0]?.count ?? 0,
      courtCount: courtCountRows[0]?.count ?? 0,
    }
  })
}

/**
 * Returns a full revenue report for the period [from, to).
 * Runs current + previous period queries in parallel.
 * `prevPeriod` is null when the previous period has zero activity.
 */
export async function getRevenueReport(
  tenantId: string,
  from: Date,
  to: Date,
  openingHours: OpeningHours,
  prevFrom: Date,
  prevTo: Date,
): Promise<RevenueReport> {
  const [current, prev] = await Promise.all([
    fetchPeriodAgg(tenantId, from, to),
    fetchPeriodAgg(tenantId, prevFrom, prevTo),
  ])

  // Per-court available minutes = total available / court count
  const totalAvailable = calcAvailableMinutes(from, to, openingHours, current.courtCount)
  const perCourtAvailable = current.courtCount > 0 ? totalAvailable / current.courtCount : 0

  const byCourt: CourtReport[] = current.byCourt.map((c) => ({
    courtId: c.courtId,
    courtName: c.courtName,
    income: c.income,
    bookingCount: c.bookingCount,
    occupancyPct: calcOccupancyPct(c.bookedMinutes, perCourtAvailable),
  }))

  const prevPeriod: PeriodTotals | null =
    prev.income === 0 && prev.adjustment === 0
      ? null
      : {
          income: prev.income,
          adjustment: prev.adjustment,
          balance: prev.income + prev.adjustment,
        }

  return {
    period: { from, to },
    income: current.income,
    adjustment: current.adjustment,
    balance: current.income + current.adjustment,
    bookingCount: current.bookingCount,
    byCourt,
    byMethod: current.byMethod,
    prevPeriod,
  }
}

/** Returns all cash flows in [from, to) with court name resolved via booking join. */
export async function getCashFlowsForExport(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<CashFlowExportRow[]> {
  return withTenantContext(tenantId, async (tx) => {
    const rows = await tx
      .select({
        occurredAt: cashFlows.occurredAt,
        type: cashFlows.type,
        category: cashFlows.category,
        amount: cashFlows.amount,
        method: cashFlows.method,
        description: cashFlows.description,
        courtName: courts.name,
      })
      .from(cashFlows)
      .leftJoin(bookings, eq(cashFlows.bookingId, bookings.id))
      .leftJoin(courts, eq(bookings.courtId, courts.id))
      .where(and(gte(cashFlows.occurredAt, from), lt(cashFlows.occurredAt, to)))
      .orderBy(cashFlows.occurredAt)

    return rows.map((r) => ({
      fecha: r.occurredAt.toISOString().split('T')[0],
      tipo: r.type,
      categoria: r.category,
      monto_ars: r.amount,
      metodo: r.method,
      descripcion: r.description,
      cancha: r.courtName ?? '',
    }))
  })
}
```

- [ ] **Step 4: Run integration tests to verify they pass**

```bash
pnpm test:integration tests/integration/reports.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/reports/report.service.ts tests/integration/reports.test.ts
git commit -m "feat: add report.service with revenue aggregation and CSV export queries"
```

---

## Task 3: Reportes Page + Error Boundary

**Files:**
- Create: `src/app/(admin)/reportes/page.tsx`
- Create: `src/app/(admin)/reportes/error.tsx`

- [ ] **Step 1: Create error boundary**

Create `src/app/(admin)/reportes/error.tsx`:

```tsx
'use client'

export default function ReportesError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Reportes</h1>
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-700">
          Error al cargar el reporte. {error.message}
        </p>
        <button
          onClick={reset}
          className="mt-3 text-sm font-medium text-red-700 underline hover:no-underline"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create page**

Create `src/app/(admin)/reportes/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { Download } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getRevenueReport } from '@/modules/reports/report.service'
import {
  getMonthBounds,
  prevMonthStr,
  nextMonthStr,
  formatMonthLabel,
} from '@/modules/reports/report.utils'

function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

function pctBadge(current: number, prev: number): string | null {
  if (prev === 0) return null
  const delta = Math.round(((current - prev) / prev) * 100)
  return delta >= 0 ? `↑ ${delta}%` : `↓ ${Math.abs(delta)}%`
}

function currentMonthStr(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

function isValidMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: { month?: string | string[] }
}) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const rawMonth = typeof searchParams.month === 'string' ? searchParams.month : ''
  const month = isValidMonth(rawMonth) ? rawMonth : currentMonthStr()
  const prev = prevMonthStr(month)
  const next = nextMonthStr(month)
  const { from, to } = getMonthBounds(month)
  const { from: prevFrom, to: prevTo } = getMonthBounds(prev)

  const report = await getRevenueReport(
    tenant.id,
    from,
    to,
    tenant.openingHours,
    prevFrom,
    prevTo,
  )

  const isEmpty = report.income === 0 && report.bookingCount === 0

  // CSV covers [from, last day of month] inclusive
  const csvFrom = from.toISOString().split('T')[0]
  const csvTo = new Date(to.getTime() - 86400000).toISOString().split('T')[0]

  const kpis = [
    {
      label: 'Ingresos',
      value: formatARS(report.income),
      change: report.prevPeriod ? pctBadge(report.income, report.prevPeriod.income) : null,
    },
    { label: 'Ajustes', value: formatARS(report.adjustment), change: null },
    {
      label: 'Balance',
      value: formatARS(report.balance),
      change: report.prevPeriod ? pctBadge(report.balance, report.prevPeriod.balance) : null,
    },
    { label: 'Reservas', value: String(report.bookingCount), change: null },
  ]

  return (
    <div className="space-y-6">
      {/* Header + month navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Reportes</h1>

        <div className="flex items-center gap-2">
          <form method="get" action="/reportes">
            <input type="hidden" name="month" value={prev} />
            <button
              type="submit"
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              aria-label="Mes anterior"
            >
              ←
            </button>
          </form>

          <span className="min-w-[11rem] text-center text-sm font-medium capitalize text-slate-700">
            {formatMonthLabel(month)}
          </span>

          <form method="get" action="/reportes">
            <input type="hidden" name="month" value={next} />
            <button
              type="submit"
              disabled={next > currentMonthStr()}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Mes siguiente"
            >
              →
            </button>
          </form>
        </div>
      </div>

      {isEmpty ? (
        <p className="text-sm text-slate-500">Sin movimientos en este período.</p>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {kpis.map(({ label, value, change }) => (
              <div
                key={label}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
                {change && (
                  <p
                    className={
                      'mt-0.5 text-xs ' +
                      (change.startsWith('↑') ? 'text-emerald-600' : 'text-red-600')
                    }
                  >
                    {change} vs mes ant.
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* By court */}
          {report.byCourt.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-sm font-semibold text-slate-900">Por cancha</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3 text-left">Cancha</th>
                    <th className="px-6 py-3 text-right">Ingresos</th>
                    <th className="px-6 py-3 text-right">Reservas</th>
                    <th className="px-6 py-3 text-right">Ocupación</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byCourt.map((c) => (
                    <tr key={c.courtId} className="border-b border-slate-50 last:border-0">
                      <td className="px-6 py-3 text-slate-700">{c.courtName}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate-700">
                        {formatARS(c.income)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate-700">
                        {c.bookingCount}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate-700">
                        {c.occupancyPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* By payment method */}
          {report.byMethod.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-sm font-semibold text-slate-900">Por método de pago</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3 text-left">Método</th>
                    <th className="px-6 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byMethod.map((m) => (
                    <tr key={m.method} className="border-b border-slate-50 last:border-0">
                      <td className="px-6 py-3 capitalize text-slate-700">{m.method}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate-700">
                        {formatARS(m.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* CSV export */}
      <div className="flex justify-end">
        <a
          href={`/api/reports/revenue?from=${csvFrom}&to=${csvTo}&format=csv`}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exportar CSV
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(admin)/reportes/page.tsx src/app/(admin)/reportes/error.tsx
git commit -m "feat: add reportes page with KPI cards, court/method tables, and CSV export link"
```

---

## Task 4: CSV Export Route Handler

**Files:**
- Create: `src/app/api/reports/revenue/route.ts`

- [ ] **Step 1: Implement the route handler**

Create `src/app/api/reports/revenue/route.ts`:

```ts
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getCashFlowsForExport } from '@/modules/reports/report.service'
import { toCsv } from '@/modules/reports/report.utils'

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export async function GET(req: Request): Promise<Response> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) {
    return new Response(null, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  const format = searchParams.get('format')

  if (format !== 'csv' || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return new Response('Bad Request', { status: 400 })
  }

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return new Response(null, { status: 401 })

  // from = start of day UTC; to = end of day UTC (inclusive)
  const fromDate = new Date(`${from}T00:00:00.000Z`)
  const toDate = new Date(`${to}T23:59:59.999Z`)

  const rows = await getCashFlowsForExport(tenant.id, fromDate, toDate)
  const csv = toCsv(rows as unknown as Record<string, unknown>[])

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reporte-${from}-${to}.csv"`,
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/reports/revenue/route.ts
git commit -m "feat: add CSV export route handler for financial reports"
```

---

## Task 5: Typecheck + Full Test Run

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors. Common causes if errors appear:

| Error | Fix |
|---|---|
| `sql<number>` aggregates typed as `string` | Drizzle returns strings for numeric SQL aggregates. Add `Number(r.total)` in the map, or cast explicitly with `sql<string>` and convert after |
| `rows as unknown as Record<string, unknown>[]` flagged | Expected — this cast is safe; `CashFlowExportRow` values are all `string \| number` which are `unknown` subtypes |
| `bookings.status` type mismatch with raw SQL | The `sql\`...IN ('confirmed'...)\`` string-based condition bypasses Drizzle's type system — safe but not type-checked |

- [ ] **Step 2: Run unit tests**

```bash
pnpm test
```

Expected: all existing tests + 17 new reports unit tests pass.

- [ ] **Step 3: Run integration tests**

```bash
pnpm test:integration
```

Expected: all integration tests pass including `tests/integration/reports.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: verify typecheck and tests for reportes financieros"
```
