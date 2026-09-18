import { beforeEach, describe, expect, it, vi } from 'vitest'

// Bug de plata: `runDunningSweep` aplicaba el cambio pendiente moviendo la DB,
// pero nunca tocaba el preapproval de MP — el complejo seguía pagando el monto
// VIEJO después de bajar. Tras el UPDATE, si hay `mp_subscription_id`, se llama
// a `getBillingGateway().updatePreapprovalAmount` con el monto lineal nuevo
// (patrón "MP último": si MP falla, la tx rollbackea y el próximo tick reintenta).
//
// Con precio por cancha (migr. 090/091) este barrido dejó de ser "el downgrade
// de plan de vez en cuando": es el ÚNICO lugar donde el monto de una suscripción
// que ya cobra se mueve. Cada complejo que suma o saca una cancha pasa por acá,
// así que un fallo silencioso acá cobra mal a TODOS los que cambiaron.

vi.mock('@/modules/notifications/notification.service', () => ({
  enqueueTenantOwnerNotification: vi.fn(),
}))
vi.mock('@/shared/db/audit', () => ({
  insertSystemAuditLog: vi.fn(),
}))
vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/modules/billing/lifecycle.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/billing/lifecycle.service')>()
  return {
    ...actual,
    transitionPastDueToSuspended: vi.fn(),
    transitionSuspendedToBlocked: vi.fn(),
    transitionBlockedToChurned: vi.fn(),
    transitionCanceledToBlocked: vi.fn(),
  }
})
vi.mock('@/modules/payments/mock-mp', () => ({
  MP_MOCK_ENABLED: false,
}))

const { updatePreapprovalAmount } = vi.hoisted(() => ({ updatePreapprovalAmount: vi.fn() }))
vi.mock('@/modules/billing/billing.gateway', () => ({
  getBillingGateway: () => ({ updatePreapprovalAmount }),
}))

type SqlMock = ReturnType<typeof vi.fn> & ((...args: unknown[]) => Promise<unknown[]>)

function makeSqlMock(results: unknown[][]): SqlMock {
  let call = 0
  return vi.fn(() => {
    const result = results[call] ?? []
    call += 1
    return Promise.resolve(result)
  }) as SqlMock
}

type TxMock = { execute: ReturnType<typeof vi.fn> }

function makeTxMock(results: unknown[][]): TxMock {
  let call = 0
  return {
    execute: vi.fn(() => {
      const result = results[call] ?? []
      call += 1
      return Promise.resolve(result)
    }),
  }
}

let sqlMock: SqlMock
let txMock: TxMock

vi.mock('@/shared/db/client', () => ({
  getWorkerSql: () => sqlMock,
  withTenantContext: (_id: string, fn: (tx: unknown) => Promise<unknown>) => fn(txMock),
}))

import { runDunningSweep } from '@/shared/jobs/workers/dunning-retry.worker'

// La fila única del catálogo (migr. 091). Los montos esperados de abajo se
// escriben a mano, NO derivados de la fórmula: un test que recalcula con la
// misma fórmula que el código no prueba nada.
const PLAN_ROW = {
  id: 'plan-turnogol',
  slug: 'turnogol',
  name: 'TurnoGol',
  max_courts: null,
  price_monthly: 4_700_000,
  price_annual: 4_230_000,
  price_first_court_cents: 4_700_000,
  price_extra_court_cents: 3_000_000,
  annual_discount_bps: 1_000,
}

/** 5 canchas = $47.000 + 4 × $30.000 = $167.000 por mes. */
const CINCO_CANCHAS_MENSUAL = 16_700_000
/** El mismo con 10% off, y el preapproval anual cobra UNA vez al año: × 12. */
const CINCO_CANCHAS_ANUAL = 15_030_000 * 12

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runDunningSweep — downgrade aplicado actualiza el monto recurrente en MP', () => {
  it('baja agendada por debajo de las canchas prendidas: MP cobra lo que quedó en la base, no lo agendado', async () => {
    // El dueño agendó bajar a 3 y antes del cierre volvió a prender la 4ª y la
    // 5ª. El UPDATE aplica GREATEST(agendado, prendidas) y devuelve 5: el
    // preapproval tiene que quedar en 5 canchas. Con el número agendado a
    // ciegas quedaba operando 5 y pagando 3 para siempre.
    sqlMock = makeSqlMock([
      [], // pastDueRows
      [], // suspendedRows
      [], // blockedRows
      [], // canceledRows
      [{ tenant_id: 'tenant-1', pendingBilledCourts: 3 }], // pendingItems
      [{ tenantId: 'tenant-1', tenantName: 'Club Norte', ownerName: 'Marcelo' }], // loadTenantOwners
    ])
    txMock = makeTxMock([
      [{ mp_subscription_id: 'mp-sub-1', billing_cycle: 'monthly', billed_courts: 5 }], // UPDATE ... RETURNING
      [PLAN_ROW], // loadActivePlan
    ])

    await runDunningSweep()

    expect(updatePreapprovalAmount).toHaveBeenCalledWith('mp-sub-1', CINCO_CANCHAS_MENSUAL, {
      reason: 'TurnoGol — 5 canchas (mensual)',
    })
  })

  it('mensual: PUT con la cuota lineal de las canchas nuevas', async () => {
    sqlMock = makeSqlMock([
      [], // pastDueRows
      [], // suspendedRows
      [], // blockedRows
      [], // canceledRows
      [{ tenant_id: 'tenant-1', pendingBilledCourts: 5 }], // pendingItems
      [{ tenantId: 'tenant-1', tenantName: 'Club Norte', ownerName: 'Marcelo' }], // loadTenantOwners
    ])
    txMock = makeTxMock([
      [{ mp_subscription_id: 'mp-sub-1', billing_cycle: 'monthly', billed_courts: 5 }], // UPDATE ... RETURNING
      [PLAN_ROW], // loadActivePlan
    ])

    await runDunningSweep()

    expect(updatePreapprovalAmount).toHaveBeenCalledTimes(1)
    // El `reason` viaja en el PUT porque es el único vínculo entre un
    // preapproval y su cantidad de canchas: si queda viejo, el reuso de
    // checkout pendiente deja de matchear (billing.service.ts).
    expect(updatePreapprovalAmount).toHaveBeenCalledWith('mp-sub-1', CINCO_CANCHAS_MENSUAL, {
      reason: 'TurnoGol — 5 canchas (mensual)',
    })
  })

  it('anual: PUT con el equivalente mensual con descuento POR 12 (NUNCA el mensual a pelo)', async () => {
    sqlMock = makeSqlMock([
      [],
      [],
      [],
      [],
      [{ tenant_id: 'tenant-1', pendingBilledCourts: 5 }],
      [{ tenantId: 'tenant-1', tenantName: 'Club Norte', ownerName: 'Marcelo' }],
    ])
    txMock = makeTxMock([
      [{ mp_subscription_id: 'mp-sub-1', billing_cycle: 'annual', billed_courts: 5 }],
      [PLAN_ROW],
    ])

    await runDunningSweep()

    expect(updatePreapprovalAmount).toHaveBeenCalledTimes(1)
    expect(updatePreapprovalAmount).toHaveBeenCalledWith('mp-sub-1', CINCO_CANCHAS_ANUAL, {
      reason: 'TurnoGol — 5 canchas (anual)',
    })
  })

  it('sin mp_subscription_id: aplica el cambio local y NO llama a MP', async () => {
    sqlMock = makeSqlMock([
      [],
      [],
      [],
      [],
      [{ tenant_id: 'tenant-1', pendingBilledCourts: 5 }],
      [{ tenantId: 'tenant-1', tenantName: 'Club Norte', ownerName: 'Marcelo' }],
    ])
    txMock = makeTxMock([
      [{ mp_subscription_id: null, billing_cycle: 'monthly', billed_courts: 5 }],
    ])

    await runDunningSweep()

    expect(updatePreapprovalAmount).not.toHaveBeenCalled()
  })
})
