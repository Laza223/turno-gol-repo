/**
 * H-10 de la auditoría de aislamiento del 2026-09-05
 * (`docs/audit/2026-09-05-aislamiento-rls.md`).
 *
 * Salió del barrido de clase de H-1. El ban manual recibía el `player_id` del
 * pedido y escribía la fila de `tenant_player_bans` sin verificar que esa
 * persona fuera cliente del complejo. A diferencia de la carga manual y del
 * alta de abonado, este camino NO crea la relación, así que no destraba leer
 * datos personales — pero un complejo podía escribirle un bloqueo a alguien que
 * nunca lo visitó, y esa persona lo ve, porque la policy de bloqueos propios se
 * lo muestra.
 *
 * La ficha de la persona (`/jugadores/[playerId]`) ya devuelve 404 sin
 * relación previa: `getPlayerProfile` arranca el FROM en
 * `player_tenant_relationships`. O sea que el guard no puede romper ningún
 * camino legítimo de la interfaz — la única forma de llegar acá con un
 * identificador ajeno es invocando la Server Action a mano.
 *
 * El primer caso de este archivo estuvo ROJO antes del arreglo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { banPlayerManually } from '@/modules/bans/ban.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'

let tenantA: { id: string }
let tenantB: { id: string }
let staffA: string
/** Jugador de B: nunca tuvo relación con A. Es el blanco. */
let playerDeB: string
/** Jugador de A: el caso legítimo, que el guard no puede romper. */
let playerDeA: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)

  tenantA = await createTestTenant(sql)
  tenantB = await createTestTenant(sql)

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

describe('ban manual: el jugador tiene que ser cliente del complejo', () => {
  it('el complejo A no puede banear a un jugador de B', async () => {
    const aplicado = await withTenantContext(tenantA.id, (tx) =>
      banPlayerManually(tenantA.id, playerDeB, staffA, 'Motivo inventado', null, tx),
    )
    expect(aplicado).toBe(false)
  })

  it('no queda ningún bloqueo escrito a nombre del jugador ajeno', async () => {
    const filas = await getSql()`
      SELECT id FROM tenant_player_bans
      WHERE tenant_id = ${tenantA.id} AND player_id = ${playerDeB}
    `
    expect(filas.length).toBe(0)
  })

  it('el complejo A SÍ puede banear a su propio jugador', async () => {
    // Contraparte positiva: sin esto, un guard que rechace todo también pasaría.
    const aplicado = await withTenantContext(tenantA.id, (tx) =>
      banPlayerManually(tenantA.id, playerDeA, staffA, 'Rotura de vidrios', null, tx),
    )
    expect(aplicado).toBe(true)

    const filas = await getSql()`
      SELECT reason FROM tenant_player_bans
      WHERE tenant_id = ${tenantA.id} AND player_id = ${playerDeA}
    `
    expect(filas.length).toBe(1)
  })
})
