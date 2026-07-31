/**
 * Regresión (TG-P1-MP-02, gemelo del de la seña en
 * `webhook-notification-url.test.ts`): `createPreapproval` no mandaba
 * `notification_url` en el body. MP entonces no notificaba NINGÚN cobro
 * recurrente del SaaS: el dueño pagaba, `subscription_authorized_payment` nunca
 * llegaba, y la suscripción se quedaba en `trialing` — o entraba a dunning y
 * terminaba bloqueando a un complejo que ya había pagado.
 *
 * El campo no está declarado en `PreApprovalRequest` del SDK (sí en
 * `PreferenceRequest`), así que va con un cast. Eso significa que TypeScript no
 * puede protegerlo: si alguien limpia el cast, sólo este test lo agarra. De ahí
 * que asserte el body crudo que recibe el SDK, no la firma.
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
  amount: 8_500_000, // centavos ARS → $85.000 (plan Complejo)
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

describe('MercadoPagoGateway.createPreapproval — notification_url', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('manda notification_url al SDK', async () => {
    const gw = new MercadoPagoGateway('token', { plaintextToken: true })
    await gw.createPreapproval(INPUT)

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(capturedBody().notification_url).toBe(INPUT.notificationUrl)
  })

  it('conserva el &source=saas, que es lo que rutea el webhook a la cuenta master', async () => {
    const gw = new MercadoPagoGateway('token', { plaintextToken: true })
    await gw.createPreapproval(INPUT)

    // Sin este parámetro el handler elegiría el MP del complejo para un pago
    // que vive en la cuenta master (ver mp-webhook.handler.ts).
    expect(String(capturedBody().notification_url)).toContain('source=saas')
  })

  it('no pisa el resto del body al agregar el campo por spread', async () => {
    const gw = new MercadoPagoGateway('token', { plaintextToken: true })
    await gw.createPreapproval(INPUT)

    const body = capturedBody()
    expect(body.payer_email).toBe(INPUT.payerEmail)
    expect(body.external_reference).toBe(INPUT.tenantId)
    expect(body.back_url).toBe(INPUT.returnUrl)
    expect(body.status).toBe('pending')
    expect(body.auto_recurring).toEqual({
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 85_000, // pesos, no centavos
      currency_id: 'ARS',
    })
  })

  it('normaliza localhost igual que el resto de las URLs (MP rechaza localhost)', async () => {
    const gw = new MercadoPagoGateway('token', { plaintextToken: true })
    await gw.createPreapproval({
      ...INPUT,
      notificationUrl: 'http://localhost:3000/api/webhooks/mercadopago?tenant=x&source=saas',
    })

    expect(capturedBody().notification_url).toBe(
      'http://127.0.0.1:3000/api/webhooks/mercadopago?tenant=x&source=saas',
    )
  })
})
