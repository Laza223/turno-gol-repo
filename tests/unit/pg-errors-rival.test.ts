import { describe, expect, it } from 'vitest'
import { isConcurrencyConflict, rivalErrorCode } from '@/shared/db/pg-errors'

describe('rivalErrorCode', () => {
  it('lee el código del RAISE aunque Drizzle lo envuelva en cause', () => {
    const pg = Object.assign(new Error('rival_full'), { code: 'P0001' })
    const wrapped = Object.assign(new Error('Failed query: ...'), { cause: pg })
    expect(rivalErrorCode(wrapped)).toBe('rival_full')
    expect(rivalErrorCode(pg)).toBe('rival_full')
  })

  it('ignora otros errores de Postgres y mensajes que no son códigos de RIVAL', () => {
    const unique = Object.assign(new Error('rival_full'), { code: '23505' })
    const otroRaise = Object.assign(new Error('algo cualquiera'), { code: 'P0001' })
    expect(rivalErrorCode(unique)).toBeNull()
    expect(rivalErrorCode(otroRaise)).toBeNull()
    expect(rivalErrorCode(new Error('rival_full'))).toBeNull()
    expect(rivalErrorCode(null)).toBeNull()
  })
})

describe('isConcurrencyConflict', () => {
  it('reconoce el deadlock (40P01) y el fallo de serialización (40001), también envueltos', () => {
    for (const code of ['40P01', '40001']) {
      const pg = Object.assign(new Error('x'), { code })
      expect(isConcurrencyConflict(pg)).toBe(true)
      expect(isConcurrencyConflict(Object.assign(new Error('Failed query'), { cause: pg }))).toBe(
        true,
      )
    }
  })

  it('no confunde otros códigos', () => {
    expect(isConcurrencyConflict(Object.assign(new Error('x'), { code: '23505' }))).toBe(false)
    expect(isConcurrencyConflict(new Error('x'))).toBe(false)
    expect(isConcurrencyConflict(null)).toBe(false)
  })
})
