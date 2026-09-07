/**
 * H-1 de la auditoría de aislamiento del 2026-09-05
 * (`docs/audit/2026-09-05-aislamiento-rls.md`).
 *
 * La carga manual aceptaba el `player_id` que llegara del cliente sin verificar
 * que esa persona fuera cliente del complejo. Con eso, el personal de un
 * complejo podía:
 *
 *   1. crear una reserva a nombre de un jugador ajeno (la policy de alta sobre
 *      `bookings` sólo mira `tenant_id`, no `player_id`);
 *   2. marcarla como ausente, lo que crea la fila de
 *      `player_tenant_relationships` de forma incondicional;
 *   3. y esa fila es exactamente la condición de `staff_can_see_related_players`
 *      sobre `players`, así que a partir de ahí le lee nombre, correo y
 *      teléfono a alguien que nunca fue su cliente.
 *
 * RLS no falla en ningún punto de esa cadena: el código le entrega la condición
 * que la policy pide. El guard correcto ya existía en el camino de al lado
 * (`playerBelongsToTenant`, en `contact-link.service.ts`, con un comentario que
 * describe este mismo ataque) — la carga manual no lo llamaba.
 *
 * El caso 1 de este archivo estuvo ROJO antes del arreglo: la reserva se creaba
 * sin chistar.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking } from '@/modules/bookings/booking.service'
import { BookingValidationError } from '@/modules/bookings/booking.errors'
import { artTodayStr } from '@/shared/dates/art'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'

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

let tenantA: { id: string }
let tenantB: { id: string }
let courtA: string
let staffA: string
/** Jugador de B: nunca tuvo relación con A. Es el blanco del ataque. */
let playerDeB: string
/** Jugador de A: el caso legítimo, que el guard no puede romper. */
let playerDeA: string

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha auditoria'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)

  tenantA = await createTestTenant(sql)
  tenantB = await createTestTenant(sql)
  courtA = await insertCourt(tenantA.id)

  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenantA.id, staff.id)
  staffA = staff.id

  const pB = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenantB.id, pB.id)
  playerDeB = pB.id

  const pA = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenantA.id, pA.id)
  playerDeA = pA.id
}, 60_000)

afterAll(async () => {
  await cleanupAll(getSql())
  await closeSql()
}, 60_000)

describe('carga manual: el jugador tiene que ser cliente del complejo', () => {
  it('el complejo A no puede cargar una reserva a nombre de un jugador de B', async () => {
    await expect(
      withTenantContext(tenantA.id, (tx) =>
        createManualBooking(
          tenantA.id,
          {
            courtId: courtA,
            date: artTodayStr(),
            timeStart: '10:00',
            timeEnd: '11:00',
            type: 'spontaneous',
            staffUserId: staffA,
            playerId: playerDeB,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(BookingValidationError)
  })

  it('no queda ninguna reserva ni relación escrita a nombre del jugador ajeno', async () => {
    // El daño no es sólo de lectura: sin el guard, el complejo le escribía a esa
    // persona una ausencia y, a la segunda, un bloqueo temporal que ella misma ve.
    const sql = getSql()
    const reservas = await sql`
      SELECT id FROM bookings WHERE tenant_id = ${tenantA.id} AND player_id = ${playerDeB}
    `
    expect(reservas.length).toBe(0)
    const relaciones = await sql`
      SELECT id FROM player_tenant_relationships
      WHERE tenant_id = ${tenantA.id} AND player_id = ${playerDeB}
    `
    expect(relaciones.length).toBe(0)
  })

  it('el complejo A SÍ puede cargar una reserva a nombre de su propio jugador', async () => {
    // Contraparte positiva: sin esto, un guard que rechace todo también pasaría.
    const creada = await withTenantContext(tenantA.id, (tx) =>
      createManualBooking(
        tenantA.id,
        {
          courtId: courtA,
          date: artTodayStr(),
          timeStart: '12:00',
          timeEnd: '13:00',
          type: 'spontaneous',
          staffUserId: staffA,
          playerId: playerDeA,
        },
        tx,
      ),
    )
    expect(creada.playerId).toBe(playerDeA)
  })

  it('la carga manual sin jugador (invitado suelto) sigue funcionando', async () => {
    // El campo es opcional a propósito: el mostrador carga turnos de gente sin
    // cuenta todo el tiempo. El guard no puede pedirle relación a un `null`.
    const creada = await withTenantContext(tenantA.id, (tx) =>
      createManualBooking(
        tenantA.id,
        {
          courtId: courtA,
          date: artTodayStr(),
          timeStart: '14:00',
          timeEnd: '15:00',
          type: 'spontaneous',
          staffUserId: staffA,
          guestName: 'Invitado sin cuenta',
        },
        tx,
      ),
    )
    expect(creada.playerId).toBeNull()
  })
})
