/**
 * Fix trial-first-charge: `auto_recurring.start_date` es el campo que MP usa
 * para diferir el PRIMER cobro de un preapproval a una fecha calendario dada
 * (`AutoRecurringRequest.start_date` en `node_modules/mercadopago/dist/clients/
 * preApproval/commonTypes.d.ts` — sí está tipado para `create`, a diferencia
 * de `notification_url`). `free_trial` (duración, no fecha) no sirve acá:
 * `tenants.trial_ends_at` puede haber sido extendido a mano por soporte a un
 * valor arbitrario, y ni siquiera está tipado como input de `create` en este
 * SDK (solo aparece en `AutoRecurringWithFreeTrial`, usado en respuestas).
 *
 * `start_date` SÍ está en `AutoRecurringRequest`, así que no hace falta el
 * patrón spread+cast que usa `notification_url` en este mismo archivo — se
 * agrega directo al objeto literal.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createSpy } = vi.hoisted(() => ({ createSpy: vi.fn() }))

vi.mock('@/lib/mercadopago', () => ({
  mpClient: () => ({ __mock: 'config' }),
  mpClientFromPlaintext: () => ({ __mock: 'config' }),
}))

vi.mock('mercadopago', () => ({
  MercadoPagoConfig: class {
    constructor(_: unknown) {}
  },
  Payment: class {
    constructor(_: unknown) {}
  },
  PaymentRefund: class {
    constructor(_: unknown) {}
  },
  PreApproval: class {
    constructor(_: unknown) {}
    create(args: unknown): Promise<unknown> {
      createSpy(args)
      return Promise.resolve({
        id: 'mp-preapp-1',
        init_point: 'https://mp.test/preapproval/mp-preapp-1',
      })
    }
  },
  Preference: class {
    constructor(_: unknown) {}
  },
}))

import { MercadoPagoGateway } from '@/modules/payments/mp-gateway.implementation'

const INPUT = {
  tenantId: '00000000-0000-0000-0000-0000000000aa',
  payerEmail: 'dueno@complejo.test',
  amount: 9_900_000,
  frequency: 'monthly' as const,
  planId: '00000000-0000-0000-0000-0000000000bb',
  reason: 'TurnoGol — Complejo (mensual)',
  returnUrl: 'https://turnogol.app/settings/facturacion',
  notificationUrl:
    'https://turnogol.app/api/webhooks/mercadopago?tenant=00000000-0000-0000-0000-0000000000aa&source=saas',
}

function capturedBody(): Record<string, unknown> {
  const [args] = createSpy.mock.calls[0] as [{ body: Record<string, unknown> }]
  return args.body
}

describe('MercadoPagoGateway.createPreapproval — auto_recurring.start_date', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('con firstChargeAt: manda auto_recurring.start_date en ISO-8601 (toISOString)', async () => {
    const gw = new MercadoPagoGateway('token', { plaintextToken: true })
    const firstChargeAt = new Date('2026-12-06T00:00:00.000Z')

    await gw.createPreapproval({ ...INPUT, firstChargeAt })

    const autoRecurring = capturedBody().auto_recurring as Record<string, unknown>
    expect(autoRecurring.start_date).toBe('2026-12-06T00:00:00.000Z')
  })

  it('sin firstChargeAt: NO manda start_date (cobra de inmediato, comportamiento actual)', async () => {
    const gw = new MercadoPagoGateway('token', { plaintextToken: true })

    await gw.createPreapproval(INPUT)

    const autoRecurring = capturedBody().auto_recurring as Record<string, unknown>
    expect('start_date' in autoRecurring).toBe(false)
  })
})
