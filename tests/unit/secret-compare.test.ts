import { describe, expect, it } from 'vitest'
import { secretMatches } from '@/shared/security/secret-compare'

describe('secretMatches', () => {
  it('acepta el secreto exacto', () => {
    expect(secretMatches('un-token-largo-de-verdad', 'un-token-largo-de-verdad')).toBe(true)
  })

  it('rechaza uno distinto del mismo largo', () => {
    expect(secretMatches('aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb')).toBe(false)
  })

  it('rechaza un prefijo, sin explotar por diferencia de largo', () => {
    // `timingSafeEqual` TIRA si los buffers miden distinto; el hash previo los
    // lleva a 32 bytes fijos, así que esto devuelve false en vez de romper.
    expect(secretMatches('un-token', 'un-token-largo-de-verdad')).toBe(false)
  })

  it('rechaza el string vacío contra un secreto real', () => {
    expect(secretMatches('', 'un-token-largo-de-verdad')).toBe(false)
  })

  it('rechaza SIEMPRE si el esperado está vacío', () => {
    // Un secreto sin configurar no puede volverse "match con cualquier cosa":
    // ese es el modo de falla que abre el endpoint entero.
    expect(secretMatches('', '')).toBe(false)
    expect(secretMatches('lo-que-sea', '')).toBe(false)
  })

  it('distingue mayúsculas', () => {
    expect(secretMatches('Token-Secreto-Largo', 'token-secreto-largo')).toBe(false)
  })
})
