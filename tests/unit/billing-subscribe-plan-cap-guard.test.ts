import { beforeEach, describe, expect, it, vi } from 'vitest'

// Guard que faltaba: `downgrade()` ya rechazaba bajar de plan si el complejo
// tenía más canchas online que el techo del plan destino, pero `subscribe()`
// (elegir/confirmar un plan por primera vez, siempre durante el trial) no
// comparaba nada — un complejo con 5 canchas activas podía suscribirse al
// plan más chico y arrancar por encima del techo desde el minuto cero. Este
// fix agrega el mismo guard (mismo error `DowngradeBlockedError`, mismo
// criterio de conteo `countOnlineCourts` — solo canchas `status='online'`,
// billing.service.ts) a `subscribe()`.

vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))

import { subscribe } from '@/modules/billing/billing.service'
import { DowngradeBlockedError } from '@/modules/billing/billing.errors'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import type { DbTx } from '@/shared/db/client'

const TENANT_ID = 't-1'
const PLAN_ID = 'plan-chico'

function makeSubRow() {
  return {
    status: 'trialing',
    plan_id: 'plan-old',
    billing_cycle: 'monthly',
    current_period_start: '2027-01-01T00:00:00Z',
    current_period_end: '2027-02-01T00:00:00Z',
    mp_subscription_id: null,
    mp_payer_email: null,
    pending_plan_change: null,
    pending_change_at: null,
    canceled_at: null,
    cancellation_reason: null,
    scheduled_deletion_at: null,
    dunning_started_at: null,
    last_payment_failed_at: null,
    last_payment_at: null,
  }
}

const ownerRow = { tenantName: 'Club Norte', ownerName: 'Marcelo', ownerEmail: 'marcelo@x.com' }

function planRow(maxCourts: number | null) {
  return {
    id: PLAN_ID,
    slug: 'predio',
    name: 'Predio',
    max_courts: maxCourts,
    price_monthly: 5_500_000,
    price_annual: 4_400_000,
  }
}

/**
 * tx.execute order dentro de `subscribe()` cuando el guard de cupo NO
 * bloquea: 1) loadSubForUpdate, 2) loadPlan, 3) countOnlineCourts (SOLO si
 * `maxCourts !== null` — con techo NULL el guard ni ejecuta esa query),
 * 4) loadTenantOwner, 5) UPDATE. Cuando SÍ bloquea, `subscribe()` tira antes
 * de llegar a loadTenantOwner — la tx no necesita esa respuesta.
 */
function makeTx(maxCourts: number | null, onlineCourtCount: number) {
  const execute = vi.fn().mockResolvedValueOnce([makeSubRow()]) // loadSubForUpdate
  execute.mockResolvedValueOnce([planRow(maxCourts)]) // loadPlan
  if (maxCourts !== null) execute.mockResolvedValueOnce([{ n: onlineCourtCount }]) // countOnlineCourts
  execute.mockResolvedValueOnce([ownerRow]) // loadTenantOwner (solo se llega acá si no bloquea)
  execute.mockResolvedValueOnce([]) // UPDATE tenant_subscriptions
  return { execute } as unknown as DbTx
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('subscribe — guard de cupo de plan (mismo criterio y error que downgrade)', () => {
  it('c) plan cuyo techo es MENOR que las canchas online del complejo → DowngradeBlockedError, sin llegar a MP', async () => {
    const tx = makeTx(3, 5) // techo 3, complejo con 5 canchas online
    const gateway = new MockGateway()

    await expect(subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)).rejects.toBeInstanceOf(
      DowngradeBlockedError,
    )
    // El rechazo tiene que ser ANTES de tocar MP — nunca crear un preapproval
    // para un plan al que el complejo no entra.
    expect(gateway.preapprovalCalls).toHaveLength(0)
  })

  it('c) plan que sí le entra al complejo (techo >= canchas online) → subscribe sigue funcionando', async () => {
    const tx = makeTx(6, 5) // techo 6, complejo con 5 canchas online
    const gateway = new MockGateway()

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('plan sin techo (max_courts NULL, ej. Estadio) → nunca bloquea, sin importar cuántas canchas tenga', async () => {
    const tx = makeTx(null, 999)
    const gateway = new MockGateway()

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.preapprovalCalls).toHaveLength(1)
  })
})
