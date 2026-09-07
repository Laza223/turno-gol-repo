/**
 * Barrido de la CLASE de H-1 (auditoría de aislamiento del 2026-09-05).
 *
 * El hallazgo original era la carga manual de reservas. Al buscar dónde más
 * entra un `player_id` del cliente y termina creando la relación que destraba
 * leer datos personales, apareció el alta de abonado: `createAbonado` valida la
 * cancha contra el complejo —con un comentario que describe exactamente este
 * ataque— y no valida el jugador, y después llama a `ensurePTR` con el
 * identificador que le mandaron.
 *
 * El primer caso de este archivo estuvo ROJO antes del arreglo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createAbonado } from '@/modules/abonados/abonado.service'
import { PlayerNotClientError } from '@/modules/abonados/abonado.errors'
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
let playerDeB: string
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

function inputBase(): {
  courtId: string
  contactName: string
  contactPhone: string
  dayOfWeek: number
  timeStart: string
  timeEnd: string
  pricePerSession: number
  startsOn: string
} {
  return {
    courtId: courtA,
    contactName: 'Contacto auditoria',
    contactPhone: '1122334455',
    dayOfWeek: 3,
    timeStart: '20:00',
    timeEnd: '21:00',
    pricePerSession: 800000,
    startsOn: artTodayStr(),
  }
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

describe('alta de abonado: el jugador tiene que ser cliente del complejo', () => {
  it('el complejo A no puede crear un abonado a nombre de un jugador de B', async () => {
    await expect(
      withTenantContext(tenantA.id, (tx) =>
        createAbonado(tenantA.id, staffA, { ...inputBase(), playerId: playerDeB }, tx),
      ),
    ).rejects.toBeInstanceOf(PlayerNotClientError)
  })

  it('no queda relación escrita a nombre del jugador ajeno', async () => {
    const rel = await getSql()`
      SELECT id FROM player_tenant_relationships
      WHERE tenant_id = ${tenantA.id} AND player_id = ${playerDeB}
    `
    expect(rel.length).toBe(0)
  })

  it('el complejo A SÍ puede crear un abonado a nombre de su propio jugador', async () => {
    const creado = await withTenantContext(tenantA.id, (tx) =>
      createAbonado(tenantA.id, staffA, { ...inputBase(), dayOfWeek: 4, playerId: playerDeA }, tx),
    )
    expect(creado.abonado.playerId).toBe(playerDeA)
  })

  it('el abonado de un contacto sin cuenta sigue funcionando', async () => {
    // El grueso de los abonados son personas sin cuenta: el guard no puede
    // pedirle relación a un `null`.
    const creado = await withTenantContext(tenantA.id, (tx) =>
      createAbonado(tenantA.id, staffA, { ...inputBase(), dayOfWeek: 5 }, tx),
    )
    expect(creado.abonado.playerId).toBeNull()
  })
})
