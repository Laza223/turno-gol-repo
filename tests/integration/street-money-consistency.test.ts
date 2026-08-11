import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
  type TestTenant,
} from '../helpers/tenant'
import { insertBooking, insertCourt, insertTournament } from '../helpers/factories'
import { createProduct } from '@/modules/canteen/canteen.service'
import { createTab, settleTab } from '@/modules/canteen/canteen-tab.service'
import { addTeam } from '@/modules/tournaments/tournament-team.service'
import { getStreetMoney, sumStreetMoney } from '@/modules/cashflow/street-money.service'

/**
 * Fase 1 del contrato (docs/planning/2026-08-01-decisiones-de-fase-v2.md §3),
 * criterio de salida #5: "fuente única de agregados: el mismo número en toda
 * superficie que lo muestre, garantizado por diseño y verificado con test de
 * consistencia — no a ojo". Este archivo es esa verificación: seedea un
 * turno jugado sin cobrar, un fiado abierto y una cuota de torneo impaga —
 * los 3 orígenes de "plata en la calle" — y comprueba que getStreetMoney/
 * sumStreetMoney (la única función que arma el listado y el único lugar
 * donde se suma el total, consumida tanto por el encabezado de /caja como
 * por la tab /caja/deudas) los trae completos, correctos y estables entre
 * lecturas.
 */

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

const BOOKING_PRICE = 800000 // $8.000 (default de insertBooking, sin seña)
const CANTEEN_TAB_TOTAL = 300000 // $3.000
const TOURNAMENT_FEE = 450000 // $4.500

async function seedTenantWithThreeDebts(): Promise<{ tenant: TestTenant; staffId: string }> {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)

  // Origen 1: turno jugado sin cobrar (completed, sin seña → pendiente = price_snapshot entero).
  const courtId = await insertCourt(sql, tenant.id)
  await insertBooking(sql, { tenantId: tenant.id, courtId, status: 'completed' })

  // Origen 2: fiado de cantina abierto (nunca cobrado).
  const product = await withTenantContext(tenant.id, (tx) =>
    createProduct(tenant.id, { name: 'Agua mineral', price: CANTEEN_TAB_TOTAL }, tx),
  )
  await withTenantContext(tenant.id, (tx) =>
    createTab(
      tenant.id,
      staff.id,
      {
        debtorName: 'Capitán equipo 22hs',
        lines: [{ productId: product.id, qty: 1 }],
        clientIdempotencyKey: crypto.randomUUID(),
      },
      tx,
    ),
  )

  // Origen 3: cuota de inscripción de torneo impaga (arancel propio del equipo, sin pagos).
  const tournamentId = await insertTournament(sql, tenant.id)
  await withTenantContext(tenant.id, (tx) =>
    addTeam(
      tenant.id,
      staff.id,
      tournamentId,
      { name: 'Los Pibes FC', inscriptionFee: TOURNAMENT_FEE },
      tx,
    ),
  )

  return { tenant, staffId: staff.id }
}

describe('street-money.service — fuente única de "Plata en la calle" (Fase 1, criterio #5)', () => {
  it('getStreetMoney trae los 3 orígenes, cada uno con el monto pendiente correcto', async () => {
    const { tenant } = await seedTenantWithThreeDebts()

    const rows = await withTenantContext(tenant.id, (tx) => getStreetMoney(tenant.id, tx))

    expect(rows).toHaveLength(3)
    const byOrigin = Object.fromEntries(rows.map((r) => [r.origin, r]))
    expect(byOrigin.booking?.pendingCents).toBe(BOOKING_PRICE)
    expect(byOrigin.canteen_tab?.pendingCents).toBe(CANTEEN_TAB_TOTAL)
    expect(byOrigin.tournament?.pendingCents).toBe(TOURNAMENT_FEE)
  })

  it('sumStreetMoney coincide con la suma manual de los 3 orígenes', async () => {
    const { tenant } = await seedTenantWithThreeDebts()

    const rows = await withTenantContext(tenant.id, (tx) => getStreetMoney(tenant.id, tx))
    const manualSum = rows.reduce((sum, r) => sum + r.pendingCents, 0)

    expect(sumStreetMoney(rows)).toBe(manualSum)
    expect(sumStreetMoney(rows)).toBe(BOOKING_PRICE + CANTEEN_TAB_TOTAL + TOURNAMENT_FEE)
  })

  /**
   * El corazón del criterio #5: dos lecturas independientes (simulan el
   * encabezado de /caja y la tab /caja/deudas cargando por separado) tienen
   * que devolver EXACTAMENTE el mismo número — verificado con test, no a ojo.
   */
  it('dos lecturas consecutivas devuelven exactamente el mismo total y las mismas filas', async () => {
    const { tenant } = await seedTenantWithThreeDebts()

    const first = await withTenantContext(tenant.id, (tx) => getStreetMoney(tenant.id, tx))
    const second = await withTenantContext(tenant.id, (tx) => getStreetMoney(tenant.id, tx))

    expect(sumStreetMoney(second)).toBe(sumStreetMoney(first))
    const shape = (rows: typeof first) =>
      rows.map((r) => ({ origin: r.origin, refId: r.refId, pendingCents: r.pendingCents }))
    expect(shape(second)).toEqual(shape(first))
  })

  it('ordena por antigüedad ascendente (la deuda más vieja primero)', async () => {
    const { tenant } = await seedTenantWithThreeDebts()

    const rows = await withTenantContext(tenant.id, (tx) => getStreetMoney(tenant.id, tx))

    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.since.getTime()).toBeGreaterThanOrEqual(rows[i - 1]!.since.getTime())
    }
  })

  it('cobrar uno de los orígenes lo saca de la lista y baja el total sin tocar los otros dos', async () => {
    const { tenant, staffId } = await seedTenantWithThreeDebts()

    const before = await withTenantContext(tenant.id, (tx) => getStreetMoney(tenant.id, tx))
    const tab = before.find((r) => r.origin === 'canteen_tab')!

    await withTenantContext(tenant.id, (tx) =>
      settleTab(
        tenant.id,
        staffId,
        {
          tabId: tab.refId,
          charges: [{ amount: tab.pendingCents, method: 'cash' }],
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    const after = await withTenantContext(tenant.id, (tx) => getStreetMoney(tenant.id, tx))

    expect(after).toHaveLength(2)
    expect(after.some((r) => r.origin === 'canteen_tab')).toBe(false)
    expect(after.some((r) => r.origin === 'booking')).toBe(true)
    expect(after.some((r) => r.origin === 'tournament')).toBe(true)
    expect(sumStreetMoney(after)).toBe(sumStreetMoney(before) - tab.pendingCents)
  })

  it('un tenant sin deudas devuelve lista vacía y total $0', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const rows = await withTenantContext(tenant.id, (tx) => getStreetMoney(tenant.id, tx))

    expect(rows).toEqual([])
    expect(sumStreetMoney(rows)).toBe(0)
  })

  it('no mezcla deudas entre tenants (aislamiento)', async () => {
    const { tenant: tenantA } = await seedTenantWithThreeDebts()
    const sql = getSql()
    const tenantB = await createTestTenant(sql)
    const staffB = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenantB.id, staffB.id)

    const rowsA = await withTenantContext(tenantA.id, (tx) => getStreetMoney(tenantA.id, tx))
    const rowsB = await withTenantContext(tenantB.id, (tx) => getStreetMoney(tenantB.id, tx))

    expect(rowsA).toHaveLength(3)
    expect(rowsB).toEqual([])
  })
})
