import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  completeBooking,
  createManualBooking,
  createOnlineBooking,
  markNoShow,
} from '@/modules/bookings/booking.service'
import { BookingDateOutOfRangeError } from '@/modules/bookings/booking.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'

let tenant: { id: string }
let seed: IsolationSeed
let playerId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  playerId = player.id
}, 30_000)

afterAll(async () => closeSql())

describe('booking time validation: completeBooking / markNoShow', () => {
  it('completeBooking on future booking → MUST reject (currently allows: bug)', async () => {
    const futureDate = '2099-01-01'
    const booking = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date: futureDate,
          timeStart: '20:00',
          timeEnd: '21:00',
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )
    expect(booking.status).toBe('confirmed')

    // BUG EXPECTED: this should reject because time_end is in the year 2099.
    // Currently completeBooking has no time check — only autoCompleteOverdueBookings does.
    await expect(
      withTenantContext(tenant.id, (tx) => completeBooking(booking.id, 'admin', tx)),
    ).rejects.toThrow(/before|future|not yet|ended|finalized|time/i)
  }, 30_000)

  it('markNoShow on future booking → MUST reject (currently allows: bug)', async () => {
    const futureDate = '2099-01-02'
    const booking = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date: futureDate,
          timeStart: '20:00',
          timeEnd: '21:00',
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )
    expect(booking.status).toBe('confirmed')

    // BUG EXPECTED: should reject because slot hasn't started yet.
    await expect(
      withTenantContext(tenant.id, (tx) => markNoShow(booking.id, seed.staffUserId, tx)),
    ).rejects.toThrow(/before|future|not yet|ended|started|time/i)
  }, 30_000)

  it('completeBooking on past booking → allows (sanity check)', async () => {
    const pastDate = '2020-01-01'
    const booking = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date: pastDate,
          timeStart: '20:00',
          timeEnd: '21:00',
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )

    const completed = await withTenantContext(tenant.id, (tx) =>
      completeBooking(booking.id, 'admin', tx),
    )
    expect(completed.status).toBe('completed')
  }, 30_000)
})

// ─── createOnlineBooking: date window validation (BK-04) ───────────────────
// All tests below use any UUIDs for courtId/playerId for the "reject" cases
// because the date check runs BEFORE any DB call — no real court/player needed.

function artNow(): Date {
  return new Date(Date.now() - 3 * 3600_000)
}
function artTodayStr(): string {
  return artNow().toISOString().slice(0, 10)
}
function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const FAKE_COURT = '00000000-0000-0000-0000-000000000001'
const FAKE_PLAYER = '00000000-0000-0000-0000-000000000002'

describe('createOnlineBooking: date window validation (BK-04)', () => {
  it('rejects a date in the past (yesterday)', async () => {
    const yesterday = addDaysStr(artTodayStr(), -1)
    await expect(
      withTenantContext(tenant.id, (tx) =>
        createOnlineBooking(
          tenant.id,
          {
            playerId: FAKE_PLAYER,
            courtId: FAKE_COURT,
            date: yesterday,
            timeStart: '10:00',
            timeEnd: '11:00',
            requiresDeposit: false,
            depositPercentage: 0,
            maxAdvanceDays: 6,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(BookingDateOutOfRangeError)
  }, 10_000)

  it('rejects today slot whose start time has already passed in ART', async (ctx) => {
    const now = artNow()
    // Entre las 00:00 y las 00:59 ART no existe una "hora que ya pasó" dentro
    // del mismo día, así que el caso no se puede montar. La condición está
    // bien; lo que se cambia es que el salteo se REPORTE — con `return` esto
    // salía ✓ verde una hora por día sin haber ejercitado nada.
    ctx.skip(now.getUTCHours() < 1, 'antes de la 01:00 ART no hay hora pasada del mismo día')
    const today = artTodayStr()
    const pastHour = now.getUTCHours() - 1
    const timeStart = `${String(pastHour).padStart(2, '0')}:00`
    const timeEnd = `${String(pastHour + 1).padStart(2, '0')}:00`

    await expect(
      withTenantContext(tenant.id, (tx) =>
        createOnlineBooking(
          tenant.id,
          {
            playerId: FAKE_PLAYER,
            courtId: FAKE_COURT,
            date: today,
            timeStart,
            timeEnd,
            requiresDeposit: false,
            depositPercentage: 0,
            maxAdvanceDays: 6,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(BookingDateOutOfRangeError)
  }, 10_000)

  it('rejects a date beyond the maxAdvanceDays window', async () => {
    const beyondWindow = addDaysStr(artTodayStr(), 7) // 7 > maxAdvanceDays(6)
    await expect(
      withTenantContext(tenant.id, (tx) =>
        createOnlineBooking(
          tenant.id,
          {
            playerId: FAKE_PLAYER,
            courtId: FAKE_COURT,
            date: beyondWindow,
            timeStart: '10:00',
            timeEnd: '11:00',
            requiresDeposit: false,
            depositPercentage: 0,
            maxAdvanceDays: 6,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(BookingDateOutOfRangeError)
  }, 10_000)

  it('allows a valid date within the advance window (booking is created)', async () => {
    const tomorrow = addDaysStr(artTodayStr(), 1)
    const result = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
        tenant.id,
        {
          playerId: playerId,
          courtId: seed.courtId,
          date: tomorrow,
          timeStart: '10:00',
          timeEnd: '11:00',
          requiresDeposit: false,
          depositPercentage: 0,
          maxAdvanceDays: 6,
        },
        tx,
      ),
    )
    expect(result.status).toBe('confirmed')
  }, 10_000)

  // caza-bugs #13: con closes_next_day, el día operativo de AYER puede seguir
  // físicamente vigente hoy de madrugada. Antes del fix, TODO input.date < hoy
  // se rechazaba como past_date sin mirar la hora — un slot todavía futuro
  // (ej. la noche de ayer sigue abierta) era irreservable por API aunque la
  // grilla lo mostrara disponible.
  it('día operativo: no rechaza como past_date un slot de "ayer operativo" que sigue físicamente en el futuro', async (ctx) => {
    // El slot sintético de abajo arranca en `ahora + 10'` y dura 60'. Cerca del
    // final del día ART eso se rompe de DOS maneras distintas, y el `% 1440` de
    // la versión anterior de este guard escondía la segunda:
    //
    //   22:50–23:49 → wrapea el FIN. timeEnd sale '00:xx', queda MENOR que
    //                 timeStart y viola `chk_time_valid`.
    //   23:50–23:59 → wrapea el ARRANQUE. timeStart sale '00:0x' y el servicio
    //                 lo compara contra la hora de pared de HOY
    //                 (booking.service.ts:437), donde 00:0x pasó hace ~24 h →
    //                 BookingDateOutOfRangeError('past_slot').
    //
    // Aplicar el módulo ANTES de mirar el wrap hacía que un arranque wrapeado
    // (00:0x) pareciera sano, así que el guard cubría los 59 minutos del primer
    // caso y dejaba correr justo los 10 del segundo. Corrida real que lo
    // destapó: 2026-08-12 02:57 UTC = 23:57 ART, con timeStart '00:07'.
    //
    // La cuenta ahora va SIN módulo (cubre los dos wraps de una) y el salteo se
    // REPORTA: un `return` mudo pinta verde sin haber ejercitado nada.
    const nowGuard = artNow()
    const nowMins = nowGuard.getUTCHours() * 60 + nowGuard.getUTCMinutes()
    ctx.skip(
      nowMins + 10 + 60 >= 24 * 60,
      `no queda hora de pared futura hoy: "ahora + 10'" cruzaría la medianoche ART`,
    )

    const sql = getSql()
    const cndTenant = await createTestTenant(sql)
    await linkPlayerToTenant(sql, cndTenant.id, playerId)

    const yesterday = addDaysStr(artTodayStr(), -1)
    const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
    const yesterdayKey = DOW_KEYS[new Date(`${yesterday}T00:00:00Z`).getUTCDay()]!

    // Apertura recién a las 23:59: CUALQUIER hora del día cuenta como "antes de
    // abrir" → slotIsPhysicallyNextDay siempre true, sin importar a qué hora
    // real corre el test.
    await sql`
      UPDATE tenants
      SET closes_next_day = true,
          opening_hours = opening_hours || ${sql.json({ [yesterdayKey]: { open: '23:59', close: '23:59' } })}
      WHERE id = ${cndTenant.id}
    `

    // Precio uniforme las 24hs de cualquier día (to:'00:00' = fin del día,
    // Fix #11) para que calculatePrice no dependa de la hora del slot.
    const courtRows = await sql<{ id: string }[]>`
      INSERT INTO courts (tenant_id, name, capacity, pricing, status)
      VALUES (
        ${cndTenant.id}, ${'Cancha Madrugada'}, ${10},
        ${sql.json({ rules: [{ days: [...DOW_KEYS], from: '00:00', to: '00:00', price: 800000 }] })},
        'online'
      )
      RETURNING id
    `
    const courtId = courtRows[0]!.id

    // Slot que arranca 10 min a partir de "ahora" (ART) → siempre en el futuro,
    // sin importar la hora real de ejecución del test.
    const now = artNow()
    const pad = (n: number) => String(n).padStart(2, '0')
    const startTotal = (now.getUTCHours() * 60 + now.getUTCMinutes() + 10) % (24 * 60)
    const endTotal = (startTotal + 60) % (24 * 60)
    const timeStart = `${pad(Math.floor(startTotal / 60))}:${pad(startTotal % 60)}`
    const timeEnd = `${pad(Math.floor(endTotal / 60))}:${pad(endTotal % 60)}`

    const result = await withTenantContext(cndTenant.id, (tx) =>
      createOnlineBooking(
        cndTenant.id,
        {
          playerId,
          courtId,
          date: yesterday,
          timeStart,
          timeEnd,
          requiresDeposit: false,
          depositPercentage: 0,
          maxAdvanceDays: 6,
        },
        tx,
      ),
    )
    expect(result.status).toBe('confirmed')
    expect(new Date(result.date).toISOString().slice(0, 10)).toBe(yesterday)
  }, 10_000)
})
