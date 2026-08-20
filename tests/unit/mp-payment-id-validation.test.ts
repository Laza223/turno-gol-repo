import { describe, expect, it } from 'vitest'
import { webhookPayloadSchema } from '@/modules/payments/payment.schema'

const NUMERIC = '999000111'
const HARMFUL = [
  '../../etc/passwd',
  'https://evil.example/x',
  '1; DROP TABLE',
  '1 OR 1=1',
  'abc',
  '',
]

describe('webhookPayloadSchema: mpPaymentId must be strictly numeric', () => {
  it('accepts a numeric id', () => {
    const r = webhookPayloadSchema.safeParse({
      id: 'evt-1',
      type: 'payment',
      data: { id: NUMERIC },
    })
    expect(r.success).toBe(true)
  })
  for (const bad of HARMFUL) {
    it(`rejects "${bad}"`, () => {
      const r = webhookPayloadSchema.safeParse({ id: 'evt-1', type: 'payment', data: { id: bad } })
      expect(r.success).toBe(false)
    })
  }
})

/**
 * Los ids de suscripción de MP no son numéricos: son un hash de 32 hex. El id
 * de abajo es REAL — el preapproval que la suscripción de prueba creó en
 * producción el 2026-08-20, y que el schema rechazaba con `invalid payload`
 * antes de llegar siquiera a la firma.
 */
const PREAPPROVAL_REAL = '5c6294a93fe04f309344f654479e633b'

describe('webhookPayloadSchema: los eventos de suscripción traen un hash, no un número', () => {
  for (const tipo of ['subscription_preapproval', 'subscription_authorized_payment']) {
    it(`acepta el hash de 32 hex en ${tipo}`, () => {
      const r = webhookPayloadSchema.safeParse({
        id: 'evt-1',
        type: tipo,
        data: { id: PREAPPROVAL_REAL },
      })
      expect(r.success).toBe(true)
    })

    it(`sigue aceptando un id numérico en ${tipo}`, () => {
      const r = webhookPayloadSchema.safeParse({ id: 'evt-1', type: tipo, data: { id: NUMERIC } })
      expect(r.success).toBe(true)
    })

    for (const bad of HARMFUL) {
      it(`rechaza "${bad}" también en ${tipo}`, () => {
        const r = webhookPayloadSchema.safeParse({ id: 'evt-1', type: tipo, data: { id: bad } })
        expect(r.success).toBe(false)
      })
    }
  }

  it('NO afloja el camino de las señas: un `payment` con hash sigue rechazado', () => {
    // El id de un `payment` se interpola en la URL de la API de pagos de MP.
    // Aflojar ese formato para todos habría sido el atajo fácil y es justo lo
    // que este test impide.
    const r = webhookPayloadSchema.safeParse({
      id: 'evt-1',
      type: 'payment',
      data: { id: PREAPPROVAL_REAL },
    })
    expect(r.success).toBe(false)
  })

  it('el hash es exactamente 32 hex en minúscula: nada de 31, 33 ni mayúsculas', () => {
    const casos = [
      PREAPPROVAL_REAL.slice(0, 31),
      `${PREAPPROVAL_REAL}a`,
      PREAPPROVAL_REAL.toUpperCase(),
      PREAPPROVAL_REAL.replace('5', 'z'),
    ]
    for (const id of casos) {
      const r = webhookPayloadSchema.safeParse({
        id: 'evt-1',
        type: 'subscription_preapproval',
        data: { id },
      })
      expect(r.success, id).toBe(false)
    }
  })
})
