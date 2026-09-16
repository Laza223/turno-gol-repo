/**
 * MP devuelve el `init_point` de un preapproval sin plan con `&activation=true`
 * pegado, y esa URL responde "Esta página no existe" (404) en
 * `mercadopago.com.ar`. Verificado a mano en producción el 2026-09-16 con tres
 * preapprovals (mensual y anual): con el parámetro, 404; la misma URL sin él
 * abre el checkout ("¿Cómo querés pagar?" + el detalle de la suscripción).
 *
 * Sin el strip, NINGÚN dueño puede activar ni reactivar su plan: el botón lo
 * manda a una página rota de MP. Por eso el gateway lo saca antes de devolver
 * la URL a la que redirige el navegador.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createSpy, initPointRef } = vi.hoisted(() => ({
  createSpy: vi.fn(),
  initPointRef: { current: '' },
}))

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
      return Promise.resolve({ id: 'mp-preapp-1', init_point: initPointRef.current })
    }
  },
  Preference: class {
    constructor(_: unknown) {}
  },
}))

import {
  MercadoPagoGateway,
  stripActivationFlag,
} from '@/modules/payments/mp-gateway.implementation'

const INPUT = {
  tenantId: '00000000-0000-0000-0000-0000000000aa',
  payerEmail: 'dueno@complejo.test',
  amount: 6_300_000,
  frequency: 'monthly' as const,
  planId: '00000000-0000-0000-0000-0000000000bb',
  reason: 'TurnoGol — Predio (mensual)',
  returnUrl: 'https://turnogol.app/settings/facturacion',
  notificationUrl: 'https://turnogol.app/api/webhooks/mercadopago?tenant=x&source=saas',
}

describe('stripActivationFlag', () => {
  it.each([
    [
      'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc&activation=true',
      'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc',
    ],
    [
      'https://www.mercadopago.com.ar/subscriptions/checkout?activation=true&preapproval_id=abc',
      'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc',
    ],
    [
      'https://www.mercadopago.com.ar/subscriptions/checkout?a=1&activation=true&preapproval_id=abc',
      'https://www.mercadopago.com.ar/subscriptions/checkout?a=1&preapproval_id=abc',
    ],
  ])('saca el parámetro roto: %s', (input, expected) => {
    expect(stripActivationFlag(input)).toBe(expected)
  })

  it('deja intacta una URL que no lo trae', () => {
    const url = 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc'
    expect(stripActivationFlag(url)).toBe(url)
  })

  it('no toca otros parámetros parecidos', () => {
    const url = 'https://www.mercadopago.com.ar/checkout?deactivation=true&activation=false'
    expect(stripActivationFlag(url)).toBe(url)
  })
})

describe('MercadoPagoGateway.createPreapproval — init_point', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve la URL de checkout sin el activation=true que la rompe', async () => {
    initPointRef.current =
      'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=mp-preapp-1&activation=true'
    const gateway = new MercadoPagoGateway('token', { plaintextToken: true })

    const res = await gateway.createPreapproval(INPUT)

    expect(res.initPoint).toBe(
      'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=mp-preapp-1',
    )
  })
})
