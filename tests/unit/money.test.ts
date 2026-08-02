import { describe, it, expect } from 'vitest'
import {
  centsToInputDisplay,
  centsToWordsEsAr,
  integerToWordsEsAr,
  MONEY_WORDS_THRESHOLD_CENTS,
  parsePesosToCents,
} from '@/lib/money'

describe('parsePesosToCents', () => {
  it('descarta el separador de miles (nunca lo interpreta como decimal)', () => {
    expect(parsePesosToCents('35.000')).toBe(3_500_000)
    expect(parsePesosToCents('35000')).toBe(3_500_000)
    expect(parsePesosToCents('$35.000')).toBe(3_500_000)
    expect(parsePesosToCents('35,000')).toBe(3_500_000)
  })

  it('devuelve null si no hay dígitos', () => {
    expect(parsePesosToCents('')).toBeNull()
    expect(parsePesosToCents('abc')).toBeNull()
    expect(parsePesosToCents('$')).toBeNull()
  })

  it('nunca produce un negativo (el signo se descarta como separador)', () => {
    expect(parsePesosToCents('-500')).toBe(50_000)
  })
})

describe('centsToInputDisplay', () => {
  it('formatea con separador de miles es-AR, sin símbolo', () => {
    expect(centsToInputDisplay(2_500_000)).toBe('25.000')
    expect(centsToInputDisplay(100)).toBe('1')
  })

  it('null/undefined → string vacío', () => {
    expect(centsToInputDisplay(null)).toBe('')
    expect(centsToInputDisplay(undefined)).toBe('')
  })
})

describe('integerToWordsEsAr', () => {
  it('el ejemplo canónico de la visión: 25.000 → veinticinco mil', () => {
    expect(integerToWordsEsAr(25_000)).toBe('veinticinco mil')
  })

  it('aplica la apócope de "uno" antes de mil/millones (veintiún, no veintiuno)', () => {
    expect(integerToWordsEsAr(21_000)).toBe('veintiún mil')
    expect(integerToWordsEsAr(21_000_000)).toBe('veintiún millones')
  })

  it('mil exacto no dice "un mil"', () => {
    expect(integerToWordsEsAr(1000)).toBe('mil')
  })

  it('cien exacto no dice "uno cientos"', () => {
    expect(integerToWordsEsAr(100_000)).toBe('cien mil')
  })

  it('compone centenas + decenas + mil + centenas del resto', () => {
    expect(integerToWordsEsAr(184_500)).toBe('ciento ochenta y cuatro mil quinientos')
  })

  it('un millón exacto', () => {
    expect(integerToWordsEsAr(1_000_000)).toBe('un millón')
  })

  it('casos de una y dos cifras', () => {
    expect(integerToWordsEsAr(0)).toBe('cero')
    expect(integerToWordsEsAr(15)).toBe('quince')
    expect(integerToWordsEsAr(21)).toBe('veintiuno')
    expect(integerToWordsEsAr(115)).toBe('ciento quince')
  })
})

describe('centsToWordsEsAr', () => {
  it('redondea al peso entero antes de convertir', () => {
    expect(centsToWordsEsAr(2_500_000)).toBe('veinticinco mil')
  })
})

it('el umbral de relectura es $10.000', () => {
  expect(MONEY_WORDS_THRESHOLD_CENTS).toBe(1_000_000)
})
