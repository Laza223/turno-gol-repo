import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  getPublicAvailability,
  getPublicTenant,
  getPublicWeeklyAvailability,
} from '@/modules/tenants/public.service'
import { addDays, artTodayStr } from '@/shared/dates/art'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 800000,
    },
  ],
}

beforeAll(async () => {
  await ensureRoles()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

// Complejo activo con una cancha online por formato (por defecto, una de Fútbol 5) y la
// anticipación de reserva fijada (el default de la columna no la trae y el servicio cae a 6).
async function publicTenantWithCourt(bookingAdvanceDays: number, formats: number[] = [5]) {
  const sql = getSql()
  const t = await createTestTenant(sql)
  await sql`
    UPDATE tenants
    SET status = 'active',
        settings = settings || ${sql.json({ booking_advance_days: bookingAdvanceDays })}
    WHERE id = ${t.id}
  `
  for (const [i, format] of formats.entries()) {
    await sql`
      INSERT INTO courts (tenant_id, name, capacity, format, pricing, status)
      VALUES (${t.id}, ${`Cancha ${i + 1}`}, ${format * 2}, ${format}, ${sql.json(PRICING)}, 'online')
    `
  }
  const tenant = await getPublicTenant(t.slug)
  expect(tenant).not.toBeNull()
  return tenant!
}

describe('getPublicWeeklyAvailability', () => {
  it('returns 7 consecutive days each with the online court', async () => {
    const tenant = await publicTenantWithCourt(6)
    const today = artTodayStr()

    const week = await getPublicWeeklyAvailability(tenant, today)
    expect(week.startDate).toBe(today)
    expect(week.days).toHaveLength(7)
    expect(week.days[0]!.date).toBe(today)
    expect(week.days[6]!.date).toBe(addDays(today, 6))
    expect(week.days[0]!.courts).toHaveLength(1)
    expect(week.days[0]!.courts[0]!.slots.length).toBeGreaterThan(0)
    // El formato de la cancha viaja con la lectura (la fila de cancha lo muestra).
    expect(week.days[0]!.courts[0]!.format).toBe(5)
  })

  it('does not return days past today + bookingAdvanceDays', async () => {
    const tenant = await publicTenantWithCourt(3)
    const today = artTodayStr()

    // Empieza en un día válido, pero los 7 días que siguen se pasan de la ventana.
    const week = await getPublicWeeklyAvailability(tenant, addDays(today, 2))
    expect(week.days.map((d) => d.date)).toEqual([addDays(today, 2), addDays(today, 3)])
  })

  it('returns no days when start is already outside the window', async () => {
    const tenant = await publicTenantWithCourt(3)

    const week = await getPublicWeeklyAvailability(tenant, addDays(artTodayStr(), 4))
    expect(week.days).toEqual([])
  })
})

describe('getPublicAvailability (lectura de un día)', () => {
  it('cada cancha trae su formato real (courts.format), no el default', async () => {
    const tenant = await publicTenantWithCourt(6, [7, 11])

    const day = await getPublicAvailability(tenant, artTodayStr())

    // El orden no es contrato: se compara por nombre.
    const formatByName = Object.fromEntries(day.courts.map((c) => [c.name, c.format]))
    expect(formatByName).toEqual({ 'Cancha 1': 7, 'Cancha 2': 11 })
  })
})
