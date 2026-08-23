import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { bookingCode } from '@/lib/booking-code'

describe('bookingCode', () => {
  it('son los primeros 8 caracteres del UUID en mayúscula', () => {
    expect(bookingCode('9fcb4ecc-1234-4000-8000-abcdefabcdef')).toBe('9FCB4ECC')
  })

  /**
   * El código se le da al jugador para que se lo pase al complejo, así que
   * tiene que servir en el buscador de reservas del admin. Ese buscador hace
   * `b.id::text ILIKE '<lo tipeado>%'` contra el UUID guardado en minúsculas:
   * si el código no fuera un prefijo exacto del id, no encontraría nada.
   */
  it('es un prefijo del UUID, insensible a mayúsculas como el buscador', () => {
    for (let i = 0; i < 200; i++) {
      const id = randomUUID()
      const code = bookingCode(id)
      expect(code).toHaveLength(8)
      expect(id.toLowerCase().startsWith(code.toLowerCase())).toBe(true)
    }
  })
})
