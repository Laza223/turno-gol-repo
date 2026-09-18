import { describe, it, expect } from 'vitest'
import { courtsPerRow } from '@/app/(admin)/reservas/CourtBoard'

/**
 * El reparto de columnas del tablero de /reservas. La regla la pidió el dueño
 * el 2026-09-17: con 6 canchas o más el tablero baja de fila en vez de empujar
 * columnas fuera del viewport (a 1440px entran 4 cómodas y la quinta desborda).
 *
 * Lo que se fija acá es que el reparto sea PAREJO y no "llenar 5 y bajar una":
 * 6 canchas son 3+3, no 5+1. Eso es lo que evita la fila con una sola columna
 * al lado de un hueco de cuatro.
 */
describe('courtsPerRow', () => {
  it('hasta 5 canchas, todas en una fila', () => {
    expect(courtsPerRow(1)).toBe(1)
    expect(courtsPerRow(3)).toBe(3)
    expect(courtsPerRow(5)).toBe(5)
  })

  it('a partir de 6, dos filas parejas', () => {
    expect(courtsPerRow(6)).toBe(3)
    expect(courtsPerRow(7)).toBe(4)
    expect(courtsPerRow(8)).toBe(4)
    expect(courtsPerRow(9)).toBe(5)
    expect(courtsPerRow(10)).toBe(5)
  })

  it('con 11 o más se sigue repartiendo en dos filas y el ancho de columna lo resuelve el scroll', () => {
    // `minmax(13.75rem, 1fr)`: cuando la columna no entra en 220px el
    // contenedor scrollea horizontal solo. No hay una tercera fila.
    expect(courtsPerRow(11)).toBe(6)
    expect(courtsPerRow(14)).toBe(7)
  })

  it('cero canchas no rompe la grilla', () => {
    // `grid-template-columns: repeat(0, ...)` es inválido; el tablero igual no
    // se monta sin canchas (la page corta antes con su EmptyState), pero el
    // piso de 1 columna evita depender de eso.
    expect(courtsPerRow(0)).toBe(1)
  })
})
