import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from 'postgres'
import { closeSql, getSql } from '@/shared/db/client'
import { findAvailableTenantIds } from '@/modules/tenants/availability-search.service'
import { searchPublicTenants } from '@/modules/tenants/search.service'
import { __setSlotsCacheStoreForTests, __resetSlotsCacheForTests } from '@/shared/cache/slots-cache'
import { addDays, artTodayStr } from '@/shared/dates/art'
import { cleanupAll, ensureRoles } from '../helpers/tenant'

const TAG = `avs${Date.now()}`

// Tomorrow in ART: always in the future (no 'past' slots) and within the
// default 6-day advance window, whatever the wall clock says.
const DATE = addDays(artTodayStr(), 1)
const TIME = '20:00'

// Uniform hours for all 7 days so the scenario does not depend on which
// weekday "tomorrow" lands on.
const OPEN_ALL_DAYS = JSON.stringify(
  Object.fromEntries(
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [
      d,
      { open: '08:00', close: '23:00' },
    ]),
  ),
)
const CLOSED_ALL_DAYS = JSON.stringify(
  Object.fromEntries(
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [
      d,
      { open: '08:00', close: '23:00', closed: true },
    ]),
  ),
)

async function seedTenant(
  sql: Sql,
  suffix: string,
  opts: { status?: string; openingHours?: string } = {},
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO tenants (slug, name, address, city, province, phone, email, status, opening_hours)
    VALUES (
      ${`${TAG}-${suffix}`}, ${`${TAG} ${suffix}`}, 'x', 'Rosario', 'Santa Fe', '1',
      ${`${TAG}${suffix}@t.local`}, ${opts.status ?? 'active'},
      ${opts.openingHours ?? OPEN_ALL_DAYS}::jsonb
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function seedCourt(
  sql: Sql,
  tenantId: string,
  format: number,
  status = 'online',
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, format, capacity, status)
    VALUES (${tenantId}, ${`Cancha F${format}`}, ${format}, ${format * 2}, ${status})
    RETURNING id
  `
  return rows[0]!.id
}

async function seedBooking(
  sql: Sql,
  tenantId: string,
  courtId: string,
  timeStart: string,
  timeEnd: string,
  status = 'confirmed',
): Promise<void> {
  await sql`
    INSERT INTO bookings (
      tenant_id, court_id, date, time_start, time_end, starts_at, ends_at, status, price_snapshot
    )
    VALUES (
      ${tenantId}, ${courtId}, ${DATE}, ${timeStart}, ${timeEnd},
      (${DATE}::date + ${timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${DATE}::date + ${timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${status}, 0
    )
  `
}

let free: string // A: free F5 court at 20:00
let overlapped: string // B: F5 court with a 19:30–20:30 booking (partial overlap)
let closedDay: string // C: closed that day
let onlyF11Free: string // D: F5 court taken, F11 court free
let oneOfTwoFree: string // E: two F5 courts, one taken
let suspended: string // F: free court but tenant not publicly visible
let offlineCourt: string // G: its only court is offline
let canceledBooking: string // H: 20:00 booking exists but is canceled

beforeAll(async () => {
  // The availability search must hit the DB in these tests, never Upstash.
  __setSlotsCacheStoreForTests(null)
  await ensureRoles()
  const sql = getSql()

  free = await seedTenant(sql, 'free')
  await seedCourt(sql, free, 5)

  overlapped = await seedTenant(sql, 'overlap')
  const bCourt = await seedCourt(sql, overlapped, 5)
  await seedBooking(sql, overlapped, bCourt, '19:30', '20:30')

  closedDay = await seedTenant(sql, 'closed', { openingHours: CLOSED_ALL_DAYS })
  await seedCourt(sql, closedDay, 5)

  onlyF11Free = await seedTenant(sql, 'f11')
  const dCourt5 = await seedCourt(sql, onlyF11Free, 5)
  await seedCourt(sql, onlyF11Free, 11)
  await seedBooking(sql, onlyF11Free, dCourt5, '20:00', '21:00')

  oneOfTwoFree = await seedTenant(sql, 'two')
  const eCourt1 = await seedCourt(sql, oneOfTwoFree, 5)
  await seedCourt(sql, oneOfTwoFree, 5)
  await seedBooking(sql, oneOfTwoFree, eCourt1, '20:00', '21:00')

  suspended = await seedTenant(sql, 'susp', { status: 'suspended' })
  await seedCourt(sql, suspended, 5)

  offlineCourt = await seedTenant(sql, 'off')
  await seedCourt(sql, offlineCourt, 5, 'offline')

  canceledBooking = await seedTenant(sql, 'cancel')
  const hCourt = await seedCourt(sql, canceledBooking, 5)
  await seedBooking(sql, canceledBooking, hCourt, '20:00', '21:00', 'canceled_no_refund')
})

afterAll(async () => {
  __resetSlotsCacheForTests()
  await cleanupAll()
  await closeSql()
})

describe('findAvailableTenantIds', () => {
  it('includes a tenant with a free court at the requested time', async () => {
    const ids = await findAvailableTenantIds({ date: DATE, time: TIME })
    expect(ids).toContain(free)
  })

  it('excludes a tenant whose only court has a partially overlapping booking', async () => {
    const ids = await findAvailableTenantIds({ date: DATE, time: TIME })
    expect(ids).not.toContain(overlapped)
  })

  it('excludes a tenant closed on that day', async () => {
    const ids = await findAvailableTenantIds({ date: DATE, time: TIME })
    expect(ids).not.toContain(closedDay)
  })

  it('includes a tenant when at least one of its courts is free', async () => {
    const ids = await findAvailableTenantIds({ date: DATE, time: TIME })
    expect(ids).toContain(oneOfTwoFree)
  })

  it('excludes non-visible tenants and tenants with only offline courts', async () => {
    const ids = await findAvailableTenantIds({ date: DATE, time: TIME })
    expect(ids).not.toContain(suspended)
    expect(ids).not.toContain(offlineCourt)
  })

  it('a canceled booking does not block the slot', async () => {
    const ids = await findAvailableTenantIds({ date: DATE, time: TIME })
    expect(ids).toContain(canceledBooking)
  })

  it('format filter only counts free courts of that format', async () => {
    const all = await findAvailableTenantIds({ date: DATE, time: TIME })
    expect(all).toContain(onlyF11Free) // some court free → matches without format

    const f5 = await findAvailableTenantIds({ date: DATE, time: TIME, formats: [5] })
    expect(f5).not.toContain(onlyF11Free) // its F5 court is taken
    expect(f5).toContain(free)

    const f11 = await findAvailableTenantIds({ date: DATE, time: TIME, formats: [11] })
    expect(f11).toContain(onlyF11Free)
    expect(f11).not.toContain(free) // has no F11 court
  })

  it('returns no slots at a time outside every grid', async () => {
    // 07:00 is before the 08:00 open of every seeded tenant.
    const ids = await findAvailableTenantIds({ date: DATE, time: '07:00' })
    for (const id of [free, overlapped, oneOfTwoFree, onlyF11Free]) {
      expect(ids).not.toContain(id)
    }
  })
})

describe('searchPublicTenants tenantIds filter', () => {
  it('restricts results (and total) to the given tenant ids', async () => {
    const { results, total } = await searchPublicTenants({
      q: TAG,
      tenantIds: [free, oneOfTwoFree],
    })
    expect(total).toBe(2)
    expect(results.map((r) => r.id).sort()).toEqual([free, oneOfTwoFree].sort())
  })

  it('short-circuits to empty on an empty tenantIds list', async () => {
    const { results, total } = await searchPublicTenants({ q: TAG, tenantIds: [] })
    expect(results).toEqual([])
    expect(total).toBe(0)
  })

  it('without tenantIds the behaviour is unchanged (regression)', async () => {
    const { results } = await searchPublicTenants({ q: TAG })
    const ids = results.map((r) => r.id)
    // All visible TAG tenants, including the ones with no availability at 20:00.
    for (const id of [free, overlapped, closedDay, onlyF11Free, oneOfTwoFree, offlineCourt, canceledBooking]) {
      expect(ids).toContain(id)
    }
    expect(ids).not.toContain(suspended)
  })
})
