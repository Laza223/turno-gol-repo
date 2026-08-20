import { beforeEach, describe, expect, it, vi } from 'vitest'

// Migr. 078: con qué cuenta de MercadoPago paga el complejo la suscripción,
// desacoplado del email de login. El caso real (prod, 2026-08-19): la dueña
// había probado TurnoGol como jugadora con el email de su cuenta de MP, así
// que ese email ya estaba tomado en `auth.users` y no podía mudarlo a su
// cuenta de staff — MP rechazaba el cobro y la única salida que el error le
// ofrecía estaba cerrada. `mp_payer_email` en NULL (todos los complejos
// preexistentes) tiene que seguir cobrándole al email del dueño.

vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))

import { subscribe, reactivate } from '@/modules/billing/billing.service'
import { InvalidPayerEmailError } from '@/modules/billing/billing.errors'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'
import type { DbTx } from '@/shared/db/client'

const TENANT_ID = 't-1'
const PLAN_ID = 'plan-1'
const OWNER_EMAIL = 'complejo@turnogol.app'
const MP_EMAIL = 'lajugadora@gmail.com'

const PLAN_ROW = {
  id: PLAN_ID,
  slug: 'predio',
  name: 'Predio',
  max_courts: 2,
  price_monthly: 5_500_000,
  price_annual: 4_400_000,
}

const OWNER_ROW = { tenantName: 'Club Norte', ownerName: 'Marcelo', ownerEmail: OWNER_EMAIL }

function makeTx(overrides: { status: string; mp_payer_email: string | null }): DbTx {
  const subRow = {
    status: overrides.status,
    plan_id: 'plan-old',
    billing_cycle: 'monthly',
    current_period_start: '2027-01-01T00:00:00Z',
    current_period_end: '2027-02-01T00:00:00Z',
    mp_subscription_id: null,
    mp_payer_email: overrides.mp_payer_email,
    pending_plan_change: null,
    pending_change_at: null,
    canceled_at: null,
    cancellation_reason: null,
    scheduled_deletion_at: null,
    dunning_started_at: null,
    last_payment_failed_at: null,
    last_payment_at: null,
  }
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow]) // loadSubForUpdate
    .mockResolvedValueOnce([PLAN_ROW]) // loadPlan
    .mockResolvedValueOnce([OWNER_ROW]) // loadTenantOwner
    .mockResolvedValue([]) // UPDATE + lo que siga
  return { execute } as unknown as DbTx
}

function gatewayOk(): PaymentGateway {
  return {
    cancelPreapproval: vi.fn().mockResolvedValue(undefined),
    createPreapproval: vi
      .fn()
      .mockResolvedValue({ preapprovalId: 'mp-new', initPoint: 'https://mp/checkout' }),
  } as unknown as PaymentGateway
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('payer_email de MercadoPago (migr. 078)', () => {
  it('subscribe cobra al email de MercadoPago declarado, no al de login', async () => {
    const gateway = gatewayOk()

    await subscribe(
      TENANT_ID,
      PLAN_ID,
      'monthly',
      gateway,
      makeTx({ status: 'trialing', mp_payer_email: MP_EMAIL }),
    )

    expect(gateway.createPreapproval).toHaveBeenCalledWith(
      expect.objectContaining({ payerEmail: MP_EMAIL }),
    )
  })

  it('subscribe cae al email del dueño cuando no hay ninguno declarado (todos los complejos previos)', async () => {
    const gateway = gatewayOk()

    await subscribe(
      TENANT_ID,
      PLAN_ID,
      'monthly',
      gateway,
      makeTx({ status: 'trialing', mp_payer_email: null }),
    )

    expect(gateway.createPreapproval).toHaveBeenCalledWith(
      expect.objectContaining({ payerEmail: OWNER_EMAIL }),
    )
  })

  it('reactivate usa el mismo email declarado (es el flujo del dueño moroso)', async () => {
    const gateway = gatewayOk()

    await reactivate(
      TENANT_ID,
      PLAN_ID,
      'monthly',
      gateway,
      makeTx({ status: 'suspended', mp_payer_email: MP_EMAIL }),
    )

    expect(gateway.createPreapproval).toHaveBeenCalledWith(
      expect.objectContaining({ payerEmail: MP_EMAIL }),
    )
  })
})

describe('InvalidPayerEmailError', () => {
  it('nombra el email rechazado y NO promete cambiar el email de la cuenta', () => {
    const err = new InvalidPayerEmailError(TENANT_ID, MP_EMAIL)

    expect(err.message).toContain(MP_EMAIL)
    expect(err.message).toContain('Cuenta de MercadoPago para pagar')
    // La salida vieja ("actualizá tu email") podía ser IMPOSIBLE: ese email
    // puede estar tomado en `auth.users` por la cuenta de jugador de la misma
    // persona. Prometerla otra vez es volver a encerrar al dueño.
    expect(err.message).not.toMatch(/actualiz[áa] tu email/i)
  })
})
