import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { verifyWebhookSignature } from '@/modules/payments/webhook-auth'

// MP_MOCK_ENABLED (mock-mp.ts) is computed once at module load from
// process.env and never re-evaluated. Vitest's ambient test env has
// NODE_ENV=test and no MP_MOCK_MODE, so it's false for this whole file —
// verifyWebhookSignature never takes the `if (MP_MOCK_ENABLED) return true`
// short-circuit here. Only NODE_ENV/MP_WEBHOOK_SECRET/MP_WEBHOOK_TEST_BYPASS_SECRET
// are read at CALL time, so mutating those per-test below is safe.
const env = process.env as Record<string, string | undefined>
const original = {
  NODE_ENV: env['NODE_ENV'],
  VERCEL_ENV: env['VERCEL_ENV'],
  MP_WEBHOOK_SECRET: env['MP_WEBHOOK_SECRET'],
  MP_WEBHOOK_SECRET_CHECKOUT: env['MP_WEBHOOK_SECRET_CHECKOUT'],
  MP_WEBHOOK_TEST_BYPASS_SECRET: env['MP_WEBHOOK_TEST_BYPASS_SECRET'],
}

const REAL_SECRET = 'real-secret-'.repeat(3)
/** Clave de la app de Checkout Pro (señas), distinta de la de Suscripciones. */
const CHECKOUT_SECRET = 'checkout-secret-'.repeat(2)
const TEST_BYPASS_SECRET = 'staging-bypass-secret-'.repeat(2)
const DATA_ID = '12345'
const REQUEST_ID = 'req-1'
const TS = '1718000000'

function sign(secret: string, dataId = DATA_ID, requestId = REQUEST_ID, ts = TS): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex')
  return `ts=${ts},v1=${v1}`
}

beforeEach(() => {
  env['NODE_ENV'] = 'test'
  delete env['VERCEL_ENV']
  env['MP_WEBHOOK_SECRET'] = REAL_SECRET
  delete env['MP_WEBHOOK_SECRET_CHECKOUT']
  delete env['MP_WEBHOOK_TEST_BYPASS_SECRET']
})

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
})

describe('verifyWebhookSignature — MP_WEBHOOK_SECRET (existing behavior, unchanged)', () => {
  it('accepts a valid signature against the real secret', () => {
    expect(verifyWebhookSignature(sign(REAL_SECRET), REQUEST_ID, DATA_ID)).toBe(true)
  })

  it('rejects an invalid signature when no bypass secret is configured', () => {
    expect(verifyWebhookSignature(sign('wrong-secret'), REQUEST_ID, DATA_ID)).toBe(false)
  })
})

// TurnoGol tiene DOS aplicaciones de MercadoPago (Suscripciones para el plan
// SaaS, Checkout Pro para el OAuth de señas) y MP genera una clave de firma por
// aplicación. Las dos notifican al mismo buzón: validar contra una sola
// rechazaría con 401 todo lo que firme la otra — el pago hecho en MP y la
// reserva colgada.
describe('verifyWebhookSignature — MP_WEBHOOK_SECRET_CHECKOUT (dos apps de MP)', () => {
  it('acepta la firma de la app de Checkout Pro cuando están las dos claves', () => {
    env['MP_WEBHOOK_SECRET_CHECKOUT'] = CHECKOUT_SECRET
    expect(verifyWebhookSignature(sign(CHECKOUT_SECRET), REQUEST_ID, DATA_ID)).toBe(true)
  })

  it('sigue aceptando la firma de la app de Suscripciones cuando están las dos', () => {
    env['MP_WEBHOOK_SECRET_CHECKOUT'] = CHECKOUT_SECRET
    expect(verifyWebhookSignature(sign(REAL_SECRET), REQUEST_ID, DATA_ID)).toBe(true)
  })

  it('rechaza una firma que no matchea NINGUNA de las dos', () => {
    env['MP_WEBHOOK_SECRET_CHECKOUT'] = CHECKOUT_SECRET
    expect(verifyWebhookSignature(sign('ninguna-de-las-dos'), REQUEST_ID, DATA_ID)).toBe(false)
  })

  it('acepta la de Checkout Pro en producción (el dual no abre ningún bypass)', () => {
    env['NODE_ENV'] = 'production'
    env['MP_WEBHOOK_SECRET_CHECKOUT'] = CHECKOUT_SECRET
    expect(verifyWebhookSignature(sign(CHECKOUT_SECRET), REQUEST_ID, DATA_ID)).toBe(true)
    expect(verifyWebhookSignature(sign('basura'), REQUEST_ID, DATA_ID)).toBe(false)
  })

  // Configuración transitoria posible durante la migración: la app vieja ya no
  // firma nada y sólo queda cargada la clave nueva.
  it('funciona con SOLO la clave de Checkout Pro cargada, incluso en producción', () => {
    env['NODE_ENV'] = 'production'
    delete env['MP_WEBHOOK_SECRET']
    env['MP_WEBHOOK_SECRET_CHECKOUT'] = CHECKOUT_SECRET
    expect(verifyWebhookSignature(sign(CHECKOUT_SECRET), REQUEST_ID, DATA_ID)).toBe(true)
    expect(verifyWebhookSignature(sign(REAL_SECRET), REQUEST_ID, DATA_ID)).toBe(false)
  })

  // El fail-closed de producción depende de que NO haya NINGUNA clave, no de
  // que falte una en particular.
  it('sin ninguna de las dos claves: fail-closed en producción, fail-open fuera', () => {
    delete env['MP_WEBHOOK_SECRET']
    env['NODE_ENV'] = 'production'
    expect(verifyWebhookSignature(sign(REAL_SECRET), REQUEST_ID, DATA_ID)).toBe(false)
    env['NODE_ENV'] = 'test'
    expect(verifyWebhookSignature(sign(REAL_SECRET), REQUEST_ID, DATA_ID)).toBe(true)
  })
})

describe('verifyWebhookSignature — MP_WEBHOOK_TEST_BYPASS_SECRET fallback (MP-WEBHOOK-001)', () => {
  it('accepts a signature made with the bypass secret when NODE_ENV !== production', () => {
    env['MP_WEBHOOK_TEST_BYPASS_SECRET'] = TEST_BYPASS_SECRET
    expect(verifyWebhookSignature(sign(TEST_BYPASS_SECRET), REQUEST_ID, DATA_ID)).toBe(true)
  })

  it('rejects the bypass secret when NODE_ENV === production, even if configured', () => {
    env['NODE_ENV'] = 'production'
    env['MP_WEBHOOK_TEST_BYPASS_SECRET'] = TEST_BYPASS_SECRET
    expect(verifyWebhookSignature(sign(TEST_BYPASS_SECRET), REQUEST_ID, DATA_ID)).toBe(false)
  })

  it('still accepts the real secret in production (bypass var present but unused)', () => {
    env['NODE_ENV'] = 'production'
    env['MP_WEBHOOK_TEST_BYPASS_SECRET'] = TEST_BYPASS_SECRET
    expect(verifyWebhookSignature(sign(REAL_SECRET), REQUEST_ID, DATA_ID)).toBe(true)
  })

  it('rejects a bad signature even when a bypass secret is configured (not a blanket skip)', () => {
    env['MP_WEBHOOK_TEST_BYPASS_SECRET'] = TEST_BYPASS_SECRET
    expect(verifyWebhookSignature(sign('some-other-garbage-secret'), REQUEST_ID, DATA_ID)).toBe(
      false,
    )
  })

  it('does not consult the bypass secret at all when it is unset (unchanged prior behavior)', () => {
    delete env['MP_WEBHOOK_TEST_BYPASS_SECRET']
    expect(verifyWebhookSignature(sign(TEST_BYPASS_SECRET), REQUEST_ID, DATA_ID)).toBe(false)
  })
})

describe('verifyWebhookSignature — VERCEL_ENV=preview signal (Vercel sets NODE_ENV=production for every deploy)', () => {
  it('accepts the bypass secret when NODE_ENV=production but VERCEL_ENV=preview', () => {
    env['NODE_ENV'] = 'production'
    env['VERCEL_ENV'] = 'preview'
    env['MP_WEBHOOK_TEST_BYPASS_SECRET'] = TEST_BYPASS_SECRET
    expect(verifyWebhookSignature(sign(TEST_BYPASS_SECRET), REQUEST_ID, DATA_ID)).toBe(true)
  })

  it('still rejects the bypass secret when VERCEL_ENV=production (the real prod deploy)', () => {
    env['NODE_ENV'] = 'production'
    env['VERCEL_ENV'] = 'production'
    env['MP_WEBHOOK_TEST_BYPASS_SECRET'] = TEST_BYPASS_SECRET
    expect(verifyWebhookSignature(sign(TEST_BYPASS_SECRET), REQUEST_ID, DATA_ID)).toBe(false)
  })
})
