import { describe, expect, it } from 'vitest'
import { nameFromEmail } from '@/shared/forms/name-from-email'

describe('nameFromEmail', () => {
  it('separa por punto, saca los dígitos y capitaliza', () => {
    expect(nameFromEmail('lazaro.feijoo2004@gmail.com')).toBe('Lazaro Feijoo')
  })

  it('separa por guion bajo y guion', () => {
    expect(nameFromEmail('maria_laura-gomez@mail.com')).toBe('Maria Laura Gomez')
  })

  it('corta el alias después del +', () => {
    expect(nameFromEmail('juan.perez+reservas@mail.com')).toBe('Juan Perez')
  })

  it('normaliza las mayúsculas', () => {
    expect(nameFromEmail('JUAN.PEREZ@MAIL.COM')).toBe('Juan Perez')
  })

  it('conserva las letras con acento', () => {
    expect(nameFromEmail('ángel.núñez@mail.com')).toBe('Ángel Núñez')
  })

  it('cae a "Jugador" si no queda ninguna letra', () => {
    expect(nameFromEmail('12345@mail.com')).toBe('Jugador')
    expect(nameFromEmail('+tag@mail.com')).toBe('Jugador')
    expect(nameFromEmail('...@mail.com')).toBe('Jugador')
    expect(nameFromEmail('')).toBe('Jugador')
  })

  it('no pasa de 80 caracteres ni deja un espacio al final', () => {
    const name = nameFromEmail(`${'a'.repeat(79)}.bbbb@mail.com`)
    expect(name.length).toBeLessThanOrEqual(80)
    expect(name).toBe(name.trim())
  })
})
