import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, passwordSchema } from '@/modules/auth/password'

describe('política de contraseña (spec §6.3)', () => {
  it('mínimo de 8 caracteres, sin complejidad obligatoria', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
  })

  it('rechaza contraseñas con menos de 8 caracteres', () => {
    expect(passwordSchema.safeParse('1234567').success).toBe(false)
  })

  it('acepta una contraseña de 8+ caracteres aunque no tenga símbolos ni mayúsculas', () => {
    expect(passwordSchema.safeParse('12345678').success).toBe(true)
    expect(passwordSchema.safeParse('contraseñalarga').success).toBe(true)
  })
})
