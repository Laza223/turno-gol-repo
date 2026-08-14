import { describe, expect, it } from 'vitest'
import { phone } from '@/shared/validation/primitives'

/**
 * 🟡 QA 2026-08-13: `/register` y el paso 1 del onboarding aceptaban un teléfono
 * de 5-6 dígitos. El `PhoneInput` manda el valor ya compuesto con el código de
 * país (`"+54 12345"`), así que las reglas que contaban CARACTERES de la cadena
 * entera contaban el prefijo como si fueran dígitos del abonado.
 */
describe('primitiva phone — cuenta dígitos, no caracteres', () => {
  it('acepta un número argentino real compuesto por el PhoneInput', () => {
    expect(phone.safeParse('+54 11 3344-5566').success).toBe(true)
    expect(phone.safeParse('+54 9 11 3344-5566').success).toBe(true)
  })

  it('acepta un nacional de 10 dígitos sin prefijo', () => {
    expect(phone.safeParse('3415551234').success).toBe(true)
  })

  it('rechaza el caso del hallazgo: prefijo + pocos dígitos reales', () => {
    const r = phone.safeParse('+54 12345')
    expect(r.success).toBe(false)
    expect(r.success === false && r.error.issues[0]?.message).toBe(
      'Teléfono incompleto: poné el código de área y el número.',
    )
  })

  it('rechaza un solo dígito y texto libre', () => {
    expect(phone.safeParse('1').success).toBe(false)
    expect(phone.safeParse('no tengo').success).toBe(false)
  })

  it('rechaza más de 15 dígitos (techo de E.164)', () => {
    expect(phone.safeParse('+54 1234567890123456').success).toBe(false)
  })
})
