import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { listTenants } from '@/modules/super-admin/tenants.service'
import { insertBooking, insertCourt } from '../helpers/factories'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

/**
 * Pulso por complejo en la lista y el detalle del super-admin, contra Postgres
 * real: última reserva, reservas de 7 días, online y jugadores. Un complejo sin
 * movimiento tiene que dar ceros y "Nunca" (null), no desaparecer de la lista.
 */

const sql = getSql()

beforeEach(async () => {
  await ensureRoles(sql)
  await cleanupAll(sql)
})

afterAll(async () => {
  await cleanupAll(sql)
  await closeSql()
})

describe('listTenants: pulso por complejo', () => {
  it('cuenta reservas de 7 días, online y jugadores; un complejo vacío da ceros', async () => {
    const activo = await createTestTenant(sql, { name: 'El Vagón Deportivo' })
    const vacio = await createTestTenant(sql, { name: 'Complejo Dormido' })
    const courtId = await insertCourt(sql, activo.id)
    const staff = await createTestStaffUser(sql)
    const juan = await createTestPlayer(sql)
    const ana = await createTestPlayer(sql)
    await linkPlayerToTenant(sql, activo.id, juan.id)
    await linkPlayerToTenant(sql, activo.id, ana.id)

    // Online.
    await insertBooking(sql, { tenantId: activo.id, courtId, playerId: juan.id })
    // Vencida esperando la seña: el jugador abandonó el pago, no cuenta en nada.
    await insertBooking(sql, {
      tenantId: activo.id,
      courtId,
      playerId: ana.id,
      timeStart: '16:00',
      timeEnd: '17:00',
      status: 'expired',
    })
    // Cargada por el complejo.
    const byStaff = await insertBooking(sql, {
      tenantId: activo.id,
      courtId,
      playerId: juan.id,
      timeStart: '18:00',
      timeEnd: '19:00',
    })
    await sql`UPDATE bookings SET created_by_staff = ${staff.id} WHERE id = ${byStaff}`
    // Creada hace 10 días: fuera de la ventana de 7, pero cuenta como última reserva.
    const vieja = await insertBooking(sql, {
      tenantId: activo.id,
      courtId,
      playerId: juan.id,
      timeStart: '20:00',
      timeEnd: '21:00',
    })
    await sql`UPDATE bookings SET created_at = now() - interval '10 days' WHERE id = ${vieja}`

    const list = await listTenants({ page: 1, pageSize: 50 })
    const a = list.rows.find((r) => r.id === activo.id)
    const v = list.rows.find((r) => r.id === vacio.id)

    expect(a).toMatchObject({ bookings7d: 2, onlineBookings7d: 1, playersCount: 2 })
    expect(a?.lastBookingAt).toBeInstanceOf(Date)
    expect(v).toMatchObject({
      lastBookingAt: null,
      bookings7d: 0,
      onlineBookings7d: 0,
      playersCount: 0,
    })
  })
})
