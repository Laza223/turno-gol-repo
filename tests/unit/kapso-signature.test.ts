import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyKapsoSignature } from '@/lib/kapso/signature'

// `vi.stubEnv` (y `unstubEnvs: true` en vitest.config.ts) deshace los cambios
// de env solos después de cada test: no hace falta restaurar a mano.
const SECRET = 'kapso-secret-'.repeat(3)
const BODY = '{"phone_number_id":"123","message":{"id":"wamid.1","type":"text"}}'

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('VERCEL_ENV', undefined)
  vi.stubEnv('KAPSO_WEBHOOK_SECRET', SECRET)
})

describe('verifyKapsoSignature — con secreto configurado', () => {
  it('acepta la firma HMAC-SHA256 hex del body crudo', () => {
    expect(verifyKapsoSignature(BODY, sign(BODY))).toBe(true)
  })

  it('rechaza una firma hecha con otro secreto', () => {
    expect(verifyKapsoSignature(BODY, sign(BODY, 'otro-secreto'))).toBe(false)
  })

  it('rechaza si el body cambió un solo byte (se firma el crudo, no el JSON re-serializado)', () => {
    const signature = sign(BODY)
    expect(verifyKapsoSignature(BODY.replace('wamid.1', 'wamid.2'), signature)).toBe(false)
    // Mismo JSON, distinto espaciado: re-serializar rompe la firma.
    expect(verifyKapsoSignature(JSON.stringify(JSON.parse(BODY), null, 2), signature)).toBe(false)
  })

  it('rechaza una firma de largo distinto sin tirar (timingSafeEqual exige mismo largo)', () => {
    expect(verifyKapsoSignature(BODY, 'abc')).toBe(false)
    expect(verifyKapsoSignature(BODY, sign(BODY) + '00')).toBe(false)
  })

  it('rechaza una firma del largo correcto pero con basura', () => {
    expect(verifyKapsoSignature(BODY, 'z'.repeat(64))).toBe(false)
  })

  it('rechaza el header ausente (null) y vacío', () => {
    expect(verifyKapsoSignature(BODY, null)).toBe(false)
    expect(verifyKapsoSignature(BODY, '')).toBe(false)
  })

  it('tolera mayúsculas y espacios alrededor del header', () => {
    const signature = sign(BODY)
    expect(verifyKapsoSignature(BODY, signature.toUpperCase())).toBe(true)
    expect(verifyKapsoSignature(BODY, `  ${signature}\n`)).toBe(true)
  })

  it('NO acepta el prefijo `sha256=` (Kapso manda el hex pelado)', () => {
    expect(verifyKapsoSignature(BODY, `sha256=${sign(BODY)}`)).toBe(false)
  })

  it('firma bien un body con caracteres no ASCII (UTF-8)', () => {
    const body = JSON.stringify({
      message: { id: 'x', type: 'text', text: { body: 'Hola ñandú ⚽' } },
    })
    expect(verifyKapsoSignature(body, sign(body))).toBe(true)
  })

  it('con secreto y header válido, el runtime no cambia el resultado (prod incluido)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(verifyKapsoSignature(BODY, sign(BODY))).toBe(true)
    expect(verifyKapsoSignature(BODY, sign(BODY, 'otro'))).toBe(false)
  })
})

describe('verifyKapsoSignature — sin KAPSO_WEBHOOK_SECRET', () => {
  beforeEach(() => {
    vi.stubEnv('KAPSO_WEBHOOK_SECRET', undefined)
  })

  it('fail-closed en producción: rechaza aunque venga una firma', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(verifyKapsoSignature(BODY, sign(BODY))).toBe(false)
    expect(verifyKapsoSignature(BODY, null)).toBe(false)
  })

  it('fail-open fuera de producción (dev/test)', () => {
    vi.stubEnv('NODE_ENV', 'test')
    expect(verifyKapsoSignature(BODY, null)).toBe(true)
  })

  it('un Preview de Vercel (NODE_ENV=production + VERCEL_ENV=preview) cuenta como no-prod', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(verifyKapsoSignature(BODY, null)).toBe(true)
  })

  it('la Production real de Vercel (VERCEL_ENV=production) sigue fail-closed', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(verifyKapsoSignature(BODY, null)).toBe(false)
  })

  it('un secreto vacío ("") cuenta como no configurado', () => {
    vi.stubEnv('KAPSO_WEBHOOK_SECRET', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(verifyKapsoSignature(BODY, sign(BODY, ''))).toBe(false)
  })
})
