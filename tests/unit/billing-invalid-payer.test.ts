import { beforeEach, describe, expect, it, vi } from 'vitest'

// ENS-23 (hallazgo de ensayo real): si el email del dueño del tenant no tiene
// cuenta de MercadoPago asociada, MP rechaza el preapproval con "Both payer
// and collector must be real or test users" y subscribe()/reactivate() lo
// dejaban burbujear tal cual → 500 críptico en la UI. Ambas funciones
// comparten la misma llamada a gateway.createPreapproval, así que se cubren
// las dos. Otros errores de MP (network, rate limit, etc.) NO deben
// enmascararse — deben seguir burbujeando como antes.

vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))

import { subscribe, reactivate } from '@/modules/billing/billing.service'
import { InvalidPayerEmailError } from '@/modules/billing/billing.errors'
import { MpGatewayError } from '@/modules/payments/payment.errors'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'
import type { DbTx } from '@/shared/db/client'

const TENANT_ID = 't-1'
const PLAN_ID = 'plan-1'
const OWNER_EMAIL = 'marcelo@sin-cuenta-mp.com'

const INVALID_PAYER_MP_ERROR = new MpGatewayError(
  'Failed to create MP preapproval for tenant t-1',
  { message: 'Both payer and collector must be real or test users', status: 400 },
)

function makeSubscribeTx() {
  const subRow = {
    status: 'trialing',
    plan_id: 'plan-old',
    billing_cycle: 'monthly',
    current_period_start: '2027-01-01T00:00:00Z',
    current_period_end: '2027-02-01T00:00:00Z',
    mp_subscription_id: null,
    pending_plan_change: null,
    pending_change_at: null,
    canceled_at: null,
    cancellation_reason: null,
    scheduled_deletion_at: null,
    dunning_started_at: null,
    last_payment_failed_at: null,
    last_payment_at: null,
  }
  const planRow = {
    id: PLAN_ID,
    slug: 'predio',
    name: 'Predio',
    max_courts: 2,
    price_monthly: 5_500_000,
    price_annual: 4_400_000,
  }
  const ownerRow = { tenantName: 'Club Norte', ownerName: 'Marcelo', ownerEmail: OWNER_EMAIL }
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow]) // loadSub
    .mockResolvedValueOnce([planRow]) // loadPlan
    .mockResolvedValueOnce([ownerRow]) // loadTenantOwner
  return { execute } as unknown as DbTx
}

function makeReactivateTx() {
  const subRow = {
    status: 'canceled',
    plan_id: 'plan-old',
    billing_cycle: 'monthly',
    current_period_start: '2027-01-01T00:00:00Z',
    current_period_end: '2027-02-01T00:00:00Z',
    mp_subscription_id: 'mp-old',
    pending_plan_change: null,
    pending_change_at: null,
    canceled_at: null,
    cancellation_reason: null,
    scheduled_deletion_at: null,
    dunning_started_at: null,
    last_payment_failed_at: null,
    last_payment_at: null,
  }
  const planRow = {
    id: PLAN_ID,
    slug: 'predio',
    name: 'Predio',
    max_courts: 2,
    price_monthly: 5_500_000,
    price_annual: 4_400_000,
  }
  const ownerRow = { tenantName: 'Club Norte', ownerName: 'Marcelo', ownerEmail: OWNER_EMAIL }
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow]) // loadSub
    .mockResolvedValueOnce([planRow]) // loadPlan
    .mockResolvedValueOnce([ownerRow]) // loadTenantOwner
  return { execute } as unknown as DbTx
}

function gatewayRejecting(err: unknown): PaymentGateway {
  return {
    // Fix 1 (R2 🔴): reactivate() ahora cancela el preapproval viejo (si
    // `mp_subscription_id` está seteado, como en `makeReactivateTx`) ANTES de
    // llamar a `createPreapproval` — sin este stub, ese cancel previo
    // explotaría con "cancelPreapproval is not a function" y nunca
    // llegaríamos al rechazo de MP que este archivo prueba.
    cancelPreapproval: vi.fn().mockResolvedValue(undefined),
    createPreapproval: vi.fn().mockRejectedValue(err),
  } as unknown as PaymentGateway
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('subscribe — payer sin cuenta de MP (ENS-23)', () => {
  it('convierte el rechazo de MP en InvalidPayerEmailError con mensaje claro en español', async () => {
    const tx = makeSubscribeTx()
    const gateway = gatewayRejecting(INVALID_PAYER_MP_ERROR)

    expect.assertions(2)
    try {
      await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidPayerEmailError)
      expect((err as Error).message).toBe(
        'El email de tu cuenta no tiene una cuenta de MercadoPago asociada. Creá una cuenta de MercadoPago con ese email o actualizá tu email.',
      )
    }
  })

  it('NO enmascara otros errores de MP (ej. timeout de red)', async () => {
    const tx = makeSubscribeTx()
    const networkError = new MpGatewayError('Failed to create MP preapproval for tenant t-1', {
      message: 'network timeout',
    })
    const gateway = gatewayRejecting(networkError)

    await expect(subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)).rejects.toBe(networkError)
  })
})

describe('reactivate — payer sin cuenta de MP (ENS-23, comparte createPreapproval)', () => {
  it('convierte el rechazo de MP en InvalidPayerEmailError con mensaje claro en español', async () => {
    const tx = makeReactivateTx()
    const gateway = gatewayRejecting(INVALID_PAYER_MP_ERROR)

    await expect(
      reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx),
    ).rejects.toBeInstanceOf(InvalidPayerEmailError)
  })

  it('NO enmascara otros errores de MP', async () => {
    const tx = makeReactivateTx()
    const otherError = new MpGatewayError('Failed to create MP preapproval for tenant t-1', {
      message: 'rate limited',
    })
    const gateway = gatewayRejecting(otherError)

    await expect(reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)).rejects.toBe(otherError)
  })
})
