import { describe, expect, it } from 'vitest'
import { normalizeContactPhone } from '@/modules/relationships/contact-identity'

/**
 * La clave de identidad de una persona sin cuenta (B13). Si esto agrupa de
 * más, dos personas distintas se muestran como una; si agrupa de menos, el
 * mismo Diego aparece tres veces y la lista unificada no unifica nada.
 */
describe('normalizeContactPhone', () => {
  it('reconoce como la misma persona el número con y sin prefijo de país', () => {
    const formatos = ['+54 9 11 2233-4455', '11 2233 4455', '1122334455']
    const claves = new Set(formatos.map(normalizeContactPhone))
    expect(claves.size).toBe(1)
    expect([...claves][0]).toBe('1122334455')
  })

  it('NO agrupa la forma con 0 y 15: eso es trabajo de la sugerencia', () => {
    // `0 11 15 2233-4455` es el mismo celular, pero el `15` corre la ventana de
    // 10 dígitos. Se elige no adivinar: agrupar de más fusiona dos personas sin
    // que nadie confirme. La cola de 8 dígitos (suggestionPhoneSql) sí las
    // acerca, y ahí decide un humano.
    expect(normalizeContactPhone('011 15 2233-4455')).toBe('1522334455')
    expect(normalizeContactPhone('011 15 2233-4455')).not.toBe(
      normalizeContactPhone('+54 9 11 2233-4455'),
    )
    // Lo que sí comparten: los últimos 8.
    expect(normalizeContactPhone('011 15 2233-4455').slice(-8)).toBe(
      normalizeContactPhone('+54 9 11 2233-4455').slice(-8),
    )
  })

  it('ignora todo lo que no sea dígito', () => {
    expect(normalizeContactPhone('(11) 2233-4455')).toBe('1122334455')
    expect(normalizeContactPhone('11.2233.4455')).toBe('1122334455')
  })

  it('un interno pegado al final CORRE la ventana: limitación conocida', () => {
    // "11 2233-4455 int 3" son 11 dígitos, y los últimos 10 ya no son los del
    // celular. Queda documentado a propósito: la alternativa (parsear formatos
    // argentinos) es adivinar, y adivinar mal fusiona personas. El staff
    // siempre puede vincular a mano, que es el camino previsto.
    expect(normalizeContactPhone('11 2233-4455 int 3')).toBe('1223344553')
    expect(normalizeContactPhone('11 2233-4455 int 3')).not.toBe(
      normalizeContactPhone('11 2233-4455'),
    )
  })

  it('devuelve vacío cuando no hay dígitos suficientes para afirmar identidad', () => {
    // Sin esto, todos los teléfonos mal cargados de un complejo caerían en la
    // misma clave y se mostrarían como UNA persona.
    for (const basura of ['', '   ', 'no tiene', '123', '12345', 'sin/tel']) {
      expect(normalizeContactPhone(basura)).toBe('')
    }
  })

  it('acepta null y undefined sin explotar', () => {
    expect(normalizeContactPhone(null)).toBe('')
    expect(normalizeContactPhone(undefined)).toBe('')
  })

  it('toma los últimos 10 dígitos, no los primeros', () => {
    // El prefijo de país es lo que varía; la cola es lo que identifica.
    expect(normalizeContactPhone('005491122334455')).toBe('1122334455')
    expect(normalizeContactPhone('5491122334455')).toBe('1122334455')
  })

  it('deja pasar un fijo de 6 dígitos sin recortarlo', () => {
    expect(normalizeContactPhone('4321-99')).toBe('432199')
  })
})
