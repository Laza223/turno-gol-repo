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
/** Canchas facturadas del pedido. Con 0 prendidas cualquier número ≥ 1 pasa el piso. */
const BILLED_COURTS = 1
const OWNER_EMAIL = 'marcelo@sin-cuenta-mp.com'

const INVALID_PAYER_MP_ERROR = new MpGatewayError(
  'Failed to create MP preapproval for tenant t-1',
  { message: 'Both payer and collector must be real or test users', status: 400 },
)

/** Fila única de `plans` desde la migr. 091: el monto sale de estas 3 columnas. */
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

function makeSubscribeTx() {
  const subRow = {
    status: 'trialing',
    plan_id: 'plan-old',
    billing_cycle: 'monthly',
    billed_courts: 1,
    pending_billed_courts: null,
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
  const ownerRow = { tenantName: 'Club Norte', ownerName: 'Marcelo', ownerEmail: OWNER_EMAIL }
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow]) // loadSub (sin lock)
    .mockResolvedValueOnce([PLAN_ROW]) // loadActivePlan
    .mockResolvedValueOnce([{ n: 0 }]) // countOnlineCourts (piso: 0 prendidas, nunca bloquea)
    .mockResolvedValueOnce([ownerRow]) // loadTenantOwner
    // Fix D4-A1: mp_subscription_id es NULL → no hay nada que reusar, así que
    // sigue derecho a pedir el lock real (mismo estado, nada cambió).
    .mockResolvedValueOnce([subRow]) // loadSubForUpdate
  return { execute } as unknown as DbTx
}

function makeReactivateTx() {
  const subRow = {
    status: 'canceled',
    plan_id: 'plan-old',
    billing_cycle: 'monthly',
    billed_courts: 1,
    pending_billed_courts: null,
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
  const ownerRow = { tenantName: 'Club Norte', ownerName: 'Marcelo', ownerEmail: OWNER_EMAIL }
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow]) // loadSub (sin lock)
    .mockResolvedValueOnce([PLAN_ROW]) // loadActivePlan
    // `reactivate()` también mide el piso de canchas (antes no lo hacía: con
    // bandas el techo se chequeaba solo al bajar de plan).
    .mockResolvedValueOnce([{ n: 0 }]) // countOnlineCourts
    .mockResolvedValueOnce([ownerRow]) // loadTenantOwner
    // Fix D4-A1: mp_subscription_id = 'mp-old' → SÍ intenta reusar, pero el
    // gateway acá no define getSubscriptionState (ver comentario abajo), así
    // que `reusablePendingCheckout` lo absorbe y devuelve null → sigue
    // derecho a pedir el lock real.
    .mockResolvedValueOnce([subRow]) // loadSubForUpdate
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

    expect.assertions(3)
    try {
      await subscribe(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx)
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidPayerEmailError)
      // Migr. 078: el mensaje nombra el email rechazado y manda al campo donde
      // se declara la cuenta de MercadoPago, no a cambiar el email de login
      // (esa salida podía estar cerrada — ver billing-payer-email.test.ts).
      expect((err as Error).message).toContain(OWNER_EMAIL)
      expect((err as Error).message).toContain('Cuenta de MercadoPago con la que pagás')
    }
  })

  it('NO enmascara otros errores de MP (ej. timeout de red)', async () => {
    const tx = makeSubscribeTx()
    const networkError = new MpGatewayError('Failed to create MP preapproval for tenant t-1', {
      message: 'network timeout',
    })
    const gateway = gatewayRejecting(networkError)

    await expect(subscribe(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx)).rejects.toBe(
      networkError,
    )
  })
})

describe('reactivate — payer sin cuenta de MP (ENS-23, comparte createPreapproval)', () => {
  it('convierte el rechazo de MP en InvalidPayerEmailError con mensaje claro en español', async () => {
    const tx = makeReactivateTx()
    const gateway = gatewayRejecting(INVALID_PAYER_MP_ERROR)

    await expect(
      reactivate(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx),
    ).rejects.toBeInstanceOf(InvalidPayerEmailError)
  })

  it('NO enmascara otros errores de MP', async () => {
    const tx = makeReactivateTx()
    const otherError = new MpGatewayError('Failed to create MP preapproval for tenant t-1', {
      message: 'rate limited',
    })
    const gateway = gatewayRejecting(otherError)

    await expect(reactivate(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx)).rejects.toBe(
      otherError,
    )
  })
})
