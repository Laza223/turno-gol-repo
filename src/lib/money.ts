/**
 * Fuente única de parseo/formato de plata para INPUTS EDITABLES (`MoneyInput`).
 * Para mostrar montos de solo lectura, usar `src/lib/format.ts` (formatArs).
 *
 * El dominio es pesos enteros de ARS — sin decimales (CLAUDE.md). Todo
 * separador tipeado (`.`, `,`, espacios, `$`) se descarta: nunca se
 * interpreta como decimal. "35.000" y "35000" son el mismo monto.
 */

/** "35.000" / "35000" / "$35.000" → 3500000 centavos. null si no hay dígitos. */
export function parsePesosToCents(input: string): number | null {
  const digits = input.replace(/[^\d]/g, '')
  if (digits === '') return null
  return Number(digits) * 100
}

const thousandsFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

/** Centavos → dígitos con separador de miles es-AR, sin símbolo `$`. 2500000 → "25.000". */
export function centsToInputDisplay(cents: number | null | undefined): string {
  if (cents == null) return ''
  return thousandsFormatter.format(Math.round(cents) / 100)
}

// ---------------------------------------------------------------------------
// Monto en palabras (§6.3 de la visión v2): "relectura" para hacer imposible
// tipear $25 en vez de $25.000 sin notarlo. Cubre 0..999.999.999 pesos —
// muy por encima de cualquier monto real del dominio.
// ---------------------------------------------------------------------------

const UNITS = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']
const TEENS = [
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
]
const TWENTIES = [
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
]
const TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const HUNDREDS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
]

function twoDigitsToWords(n: number): string {
  if (n < 10) return UNITS[n]!
  if (n < 20) return TEENS[n - 10]!
  if (n < 30) return TWENTIES[n - 20]!
  const tens = Math.floor(n / 10)
  const units = n % 10
  return units === 0 ? TENS[tens]! : `${TENS[tens]} y ${UNITS[units]}`
}

function threeDigitsToWords(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cien'
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const hundredsWord = HUNDREDS[hundreds]!
  if (rest === 0) return hundredsWord
  return hundredsWord ? `${hundredsWord} ${twoDigitsToWords(rest)}` : twoDigitsToWords(rest)
}

/** "...uno" → "...ún" — apócope obligatoria antes de "mil"/"millones" (veintiún mil, no veintiuno mil). */
function apocopate(words: string): string {
  return words.replace(/uno$/, 'ún')
}

/** Entero no negativo → palabras es-AR. 25000 → "veinticinco mil". 184500 → "ciento ochenta y cuatro mil quinientos". */
export function integerToWordsEsAr(n: number): string {
  if (n === 0) return 'cero'
  if (n < 0) return `menos ${integerToWordsEsAr(-n)}`

  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000

  const parts: string[] = []

  if (millions > 0) {
    parts.push(millions === 1 ? 'un millón' : `${apocopate(threeDigitsToWords(millions))} millones`)
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mil' : `${apocopate(threeDigitsToWords(thousands))} mil`)
  }
  if (rest > 0) {
    parts.push(threeDigitsToWords(rest))
  }

  return parts.join(' ').trim()
}

/** Umbral desde el que `MoneyInput` relee el monto en palabras: $10.000. */
export const MONEY_WORDS_THRESHOLD_CENTS = 1_000_000

/** Centavos → monto en palabras es-AR, redondeado al peso entero. Sin el sufijo "pesos" (lo decide el caller). */
export function centsToWordsEsAr(cents: number): string {
  return integerToWordsEsAr(Math.round(cents / 100))
}
