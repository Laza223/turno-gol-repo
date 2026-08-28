import { describe, it, expect } from 'vitest'
import {
  centsToInputDisplay,
  centsToWordsEsAr,
  integerToWordsEsAr,
  MONEY_WORDS_THRESHOLD_CENTS,
  parsePesosToCents,
  splitPesosInput,
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

  // 🔴 QA 2026-08-28 F-01: borrar el separador pegaba los centavos al entero y
  // multiplicaba el monto por 100 sin ningún aviso. Afectaba los 7 campos de
  // plata del admin, incluido el precio de cancha que ve el público.
  it('descarta los centavos en vez de pegarlos al entero', () => {
    expect(parsePesosToCents('1500,50')).toBe(150_000)
    expect(parsePesosToCents('1.500,50')).toBe(150_000)
    expect(parsePesosToCents('1500.50')).toBe(150_000)
    expect(parsePesosToCents('18500,75')).toBe(1_850_000)
    expect(parsePesosToCents('0,99')).toBe(0)
  })

  it('con 3 dígitos después del separador sigue siendo grupo de miles', () => {
    expect(parsePesosToCents('1.850.075')).toBe(185_007_500)
    expect(parsePesosToCents('20.050')).toBe(2_005_000)
  })

  it('round-trip con el display: lo que formatea vuelve a parsear igual', () => {
    for (const cents of [0, 100, 150_000, 2_005_000, 185_007_500]) {
      expect(parsePesosToCents(centsToInputDisplay(cents))).toBe(cents)
    }
  })
})

describe('splitPesosInput', () => {
  it('separa la cola decimal solo cuando son 1 o 2 dígitos', () => {
    expect(splitPesosInput('1.500,50')).toEqual({ digits: '1500', decimals: '50' })
    expect(splitPesosInput('1500,5')).toEqual({ digits: '1500', decimals: '5' })
    expect(splitPesosInput('35,000')).toEqual({ digits: '35000', decimals: null })
    expect(splitPesosInput('1.850.075')).toEqual({ digits: '1850075', decimals: null })
  })

  it('reconoce el separador recién tipeado, todavía sin dígitos detrás', () => {
    expect(splitPesosInput('1.500,')).toEqual({ digits: '1500', decimals: '' })
    expect(splitPesosInput('18.500.')).toEqual({ digits: '18500', decimals: '' })
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
