import { describe, expect, it } from 'vitest'
import { describeBossError } from '@/shared/jobs/boss-error'

/**
 * El control negativo va PRIMERO y es literal: la forma exacta que pg-boss
 * emite (`manager.js:256` de v9.0.3) contra la expresión que había en el
 * handler. Si esa expresión volviera, este archivo lo dice sin ambigüedad.
 */
const LO_QUE_EMITE_PGBOSS = {
  // `{ ...error }` de un error de node-postgres: propiedades propias, sin
  // prototipo de Error.
  code: 'ECONNRESET',
  severity: undefined,
  message: 'Connection terminated unexpectedly',
  stack: 'Error: Connection terminated unexpectedly\n    at Connection.<anonymous>',
  queue: 'reconcile-subscriptions',
  worker: 'a3f1c0de-0000-4000-8000-000000000001',
}

describe('el handler viejo perdía todo', () => {
  it('String() sobre lo que emite pg-boss da [object Object]', () => {
    const viejo = (err: unknown): string => (err instanceof Error ? err.message : String(err))
    expect(viejo(LO_QUE_EMITE_PGBOSS)).toBe('[object Object]')
  })
})

describe('describeBossError', () => {
  it('rescata message, code, cola y worker del objeto plano de pg-boss', () => {
    expect(describeBossError(LO_QUE_EMITE_PGBOSS)).toEqual({
      error: 'Connection terminated unexpectedly',
      code: 'ECONNRESET',
      queue: 'reconcile-subscriptions',
      worker: 'a3f1c0de-0000-4000-8000-000000000001',
      stack: LO_QUE_EMITE_PGBOSS.stack,
    })
  })

  it('sirve igual con un Error de verdad (db.js reenvía el del pool tal cual)', () => {
    const err = Object.assign(new Error('self-signed certificate in certificate chain'), {
      code: 'SELF_SIGNED_CERT_IN_CHAIN',
    })
    const info = describeBossError(err)
    expect(info.error).toBe('self-signed certificate in certificate chain')
    expect(info.code).toBe('SELF_SIGNED_CERT_IN_CHAIN')
    expect(info.stack).toContain('Error: self-signed certificate')
  })

  it('sin message nombra las CLAVES, nunca los valores', () => {
    // Un error de Postgres arrastra el texto de la query, que puede traer datos
    // de una persona (Ley 25.326). Volcarlo entero a Sentry sería el arreglo
    // fácil y el equivocado.
    const info = describeBossError({ queue: 'send-email', query: 'SELECT ... 11-5555-1234' })
    expect(info.error).toBe('error de pg-boss sin message (claves: queue, query)')
    expect(info.error).not.toContain('5555')
    expect(info.queue).toBe('send-email')
  })

  it('nunca devuelve un error vacío', () => {
    for (const v of [null, undefined, 0, '', new Error('')]) {
      expect(describeBossError(v).error.length).toBeGreaterThan(0)
    }
  })

  it('no inventa claves que no vinieron', () => {
    expect(describeBossError({ message: 'algo' })).toEqual({ error: 'algo' })
  })
})

describe('el handler de boss.ts usa el describe', () => {
  it('no volvió el String(err)', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/shared/jobs/boss.ts', 'utf8')
    expect(src).toContain('describeBossError(err)')
    expect(src).not.toMatch(/error:\s*err instanceof Error \? err\.message : String\(err\)/)
  })
})
