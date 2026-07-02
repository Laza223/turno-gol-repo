import { describe, expect, it } from 'vitest'
import { computeMpMockEnabled } from '@/modules/payments/mock-mp'

/**
 * BLOCKER (triage_fixes #1): el gateway mock procesa los webhooks inline, sin
 * gateway real ni pg-boss. Aunque MP_MOCK_MODE=1 se filtre a un deploy de
 * producción, el flag DEBE quedar deshabilitado.
 */
function env(o: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return o as NodeJS.ProcessEnv
}

describe('computeMpMockEnabled — guard de NODE_ENV', () => {
  it('habilita el mock en development con MP_MOCK_MODE=1', () => {
    expect(computeMpMockEnabled(env({ MP_MOCK_MODE: '1', NODE_ENV: 'development' }))).toBe(true)
  })

  it('habilita el mock en test con MP_MOCK_MODE=1', () => {
    expect(computeMpMockEnabled(env({ MP_MOCK_MODE: '1', NODE_ENV: 'test' }))).toBe(true)
  })

  it('NUNCA habilita el mock en production, aunque MP_MOCK_MODE=1', () => {
    expect(computeMpMockEnabled(env({ MP_MOCK_MODE: '1', NODE_ENV: 'production' }))).toBe(false)
  })

  it('NUNCA habilita el mock en production real de Vercel (VERCEL_ENV=production)', () => {
    expect(
      computeMpMockEnabled(
        env({ MP_MOCK_MODE: '1', NODE_ENV: 'production', VERCEL_ENV: 'production' }),
      ),
    ).toBe(false)
  })

  it('habilita el mock en un Preview deploy de Vercel (NODE_ENV=production pero VERCEL_ENV=preview)', () => {
    // Vercel fija NODE_ENV=production en TODO build desplegado, Preview incluido
    // (ver scripts/seed-staging.ts) — VERCEL_ENV=preview es la única señal confiable.
    expect(
      computeMpMockEnabled(
        env({ MP_MOCK_MODE: '1', NODE_ENV: 'production', VERCEL_ENV: 'preview' }),
      ),
    ).toBe(true)
  })

  it('queda deshabilitado si MP_MOCK_MODE no es exactamente "1"', () => {
    expect(computeMpMockEnabled(env({ NODE_ENV: 'development' }))).toBe(false)
    expect(computeMpMockEnabled(env({ MP_MOCK_MODE: '0', NODE_ENV: 'development' }))).toBe(false)
    expect(computeMpMockEnabled(env({ MP_MOCK_MODE: 'true', NODE_ENV: 'development' }))).toBe(false)
  })
})
