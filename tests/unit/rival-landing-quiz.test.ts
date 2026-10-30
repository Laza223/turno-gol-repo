import { describe, expect, it } from 'vitest'
import {
  CATEGORY_LADDER,
  QUIZ_BACKGROUNDS,
  QUIZ_FREQUENCIES,
  STARTING_CEILING,
  startingCategory,
} from '@/app/(player)/rival/_landing/quiz-table'

const rank = (name: (typeof CATEGORY_LADDER)[number]) => CATEGORY_LADDER.indexOf(name)

describe('quiz "¿De qué categoría sos?"', () => {
  it('la escala va de Novena a la Selección, con Quinta como techo del arranque', () => {
    expect(CATEGORY_LADDER[0]).toBe('Novena')
    expect(CATEGORY_LADDER[CATEGORY_LADDER.length - 1]).toBe('Selección')
    expect(STARTING_CEILING).toBe('Quinta')
  })

  it('nadie arranca más arriba de Quinta, con ninguna combinación de respuestas', () => {
    for (let w = 0; w < QUIZ_BACKGROUNDS.length; w++) {
      for (let f = 0; f < QUIZ_FREQUENCIES.length; f++) {
        expect(rank(startingCategory(w, f))).toBeLessThanOrEqual(rank(STARTING_CEILING))
      }
    }
  })

  it('sigue la tabla del doc (docs/rival/landing.md, sección 2)', () => {
    expect(startingCategory(0, 0)).toBe('Novena') // picados, 1 vez por semana
    expect(startingCategory(0, 2)).toBe('Séptima')
    expect(startingCategory(1, 2)).toBe('Sexta')
    expect(startingCategory(2, 2)).toBe('Quinta')
    expect(startingCategory(3, 0)).toBe('Sexta')
    expect(startingCategory(3, 2)).toBe('Quinta') // federado, 4 o más: el techo
  })

  it('jugar más o venir de más arriba nunca baja la categoría', () => {
    for (let w = 0; w < QUIZ_BACKGROUNDS.length; w++) {
      for (let f = 1; f < QUIZ_FREQUENCIES.length; f++) {
        expect(rank(startingCategory(w, f))).toBeGreaterThanOrEqual(
          rank(startingCategory(w, f - 1)),
        )
      }
    }
    for (let f = 0; f < QUIZ_FREQUENCIES.length; f++) {
      for (let w = 1; w < QUIZ_BACKGROUNDS.length; w++) {
        expect(rank(startingCategory(w, f))).toBeGreaterThanOrEqual(
          rank(startingCategory(w - 1, f)),
        )
      }
    }
  })

  it('una respuesta fuera de rango no inventa una categoría', () => {
    expect(() => startingCategory(9, 0)).toThrow(RangeError)
    expect(() => startingCategory(0, 9)).toThrow(RangeError)
  })
})
