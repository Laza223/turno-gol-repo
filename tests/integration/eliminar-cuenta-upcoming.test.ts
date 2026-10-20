import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withPlayerContext } from '@/shared/db/client'
import { countUpcomingConfirmed } from '@/app/(player)/eliminar-cuenta/upcoming-confirmed'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { insertBooking, insertCourt } from '../helpers/factories'

let tenantId: string
let courtId: string
let playerId: string
let otherPlayerId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  const tenant = await createTestTenant(sql)
  tenantId = tenant.id
  courtId = await insertCourt(sql, tenantId)
  const player = await createTestPlayer(sql)
  playerId = player.id
  await linkPlayerToTenant(sql, tenantId, playerId)
  const other = await createTestPlayer(sql)
  otherPlayerId = other.id
  await linkPlayerToTenant(sql, tenantId, otherPlayerId)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

/** Ahora en ART (UTC-3, sin horario de verano): día calendario y minutos desde las 00:00. */
function artNow(offsetDays = 0) {
  const d = new Date(Date.now() - 3 * 3_600_000 + offsetDays * 86_400_000)
  return { date: d.toISOString().slice(0, 10), mins: d.getUTCHours() * 60 + d.getUTCMinutes() }
}

/** Minutos desde las 00:00 a "HH:MM"; 1440 es '24:00' (el fin de un turno que llega a medianoche). */
const hhmm = (m: number) =>
  m >= 1440
    ? '24:00'
    : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

const count = () => withPlayerContext(playerId, (tx) => countUpcomingConfirmed(tx, playerId))

describe('/eliminar-cuenta: reservas confirmadas por jugar', () => {
  it('una confirmada de hoy que ya terminó NO cuenta (ends_at, no la fecha)', async () => {
    // Terminó hace entre 1 y 2 horas. Antes de las 02:05 ART no entra "hoy": se pone ayer, que
    // tampoco cuenta (ahí el test no distingue la fecha de ends_at, pero no falla de madrugada).
    const hoy = artNow()
    const enElDiaDeHoy = hoy.mins >= 125
    const dia = enElDiaDeHoy ? hoy : artNow(-1)
    const inicio = enElDiaDeHoy ? hoy.mins - 120 : 600
    await insertBooking(getSql(), {
      tenantId,
      courtId,
      playerId,
      date: dia.date,
      timeStart: hhmm(inicio),
      timeEnd: hhmm(inicio + 60),
      status: 'confirmed',
    })
    expect(await count()).toBe(0)
  })

  it('una confirmada de mañana cuenta; una cancelada no; una de OTRO jugador tampoco', async () => {
    const manana = artNow(1).date
    await insertBooking(getSql(), {
      tenantId,
      courtId,
      playerId,
      date: manana,
      timeStart: '10:00',
      timeEnd: '11:00',
      status: 'confirmed',
    })
    await insertBooking(getSql(), {
      tenantId,
      courtId,
      playerId,
      date: manana,
      timeStart: '12:00',
      timeEnd: '13:00',
      status: 'canceled_no_refund',
    })
    await insertBooking(getSql(), {
      tenantId,
      courtId,
      playerId: otherPlayerId,
      date: manana,
      timeStart: '14:00',
      timeEnd: '15:00',
      status: 'confirmed',
    })
    expect(await count()).toBe(1)
  })

  it('una confirmada en curso (empezó hace 30 min, termina en 30) cuenta', async () => {
    const hoy = artNow()
    await insertBooking(getSql(), {
      tenantId,
      courtId,
      playerId,
      date: hoy.date,
      timeStart: hhmm(Math.max(0, hoy.mins - 30)),
      timeEnd: hhmm(Math.min(1440, hoy.mins + 30)),
      status: 'confirmed',
    })
    expect(await count()).toBe(2)
  })
})
