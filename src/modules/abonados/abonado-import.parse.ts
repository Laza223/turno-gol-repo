/**
 * Importador de turnos fijos: el texto que se pega desde Excel o Sheets (o el de
 * un .csv) → filas entendidas y validadas contra las canchas del complejo.
 *
 * Puro, sin DB: lo que choca con lo ya cargado (otro fijo, reservas) lo mira
 * `abonado-import.service.ts` con las MISMAS funciones del alta manual.
 *
 * Solo se leen las columnas de la plantilla. Cualquier otra (notas,
 * observaciones, lo que traiga la planilla del complejo) se ignora y nunca llega
 * a la base: nada de texto libre sobre personas (Ley 25.326).
 */
import {
  END_OF_DAY_MINS,
  endLabelFromMins,
  hhmmToMins,
  startLabelFromMins,
} from '@/shared/time/operating-day'
import { formatFullPhone, parsePhoneNumber } from '@/lib/phone'
import type { ImportField, ImportRowValue } from './abonado-import.types'

/**
 * Tope por lote. Cada fila va en su propia transacción y no traba las canchas:
 * esto acota cuánto tarda la carga (200 filas, ~6 s contra un Postgres local).
 */
export const MAX_IMPORT_ROWS = 200

/** Lo que se copia o se descarga como plantilla. La primera fila es la que se reconoce. */
export const IMPORT_TEMPLATE = [
  ['Nombre', 'Teléfono', 'Cancha', 'Día', 'Desde', 'Hasta', 'Precio'],
  ['Juan Pérez', '11 2345-6789', 'Cancha 1', 'Lunes', '20:00', '21:00', '25000'],
]

const REQUIRED_FIELDS: ImportField[] = ['name', 'phone', 'court', 'day', 'start', 'price']

const FIELD_LABELS: Record<ImportField, string> = {
  name: 'Nombre',
  phone: 'Teléfono',
  court: 'Cancha',
  day: 'Día',
  start: 'Desde',
  end: 'Hasta',
  price: 'Precio',
}

/** Encabezados aceptados, ya normalizados con `normalizeKey`. */
const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  // Sin «contacto»: en muchas planillas esa columna es el teléfono.
  name: ['nombre', 'cliente', 'equipo', 'responsable', 'titular', 'nombreyapellido'],
  phone: ['telefono', 'tel', 'celular', 'cel', 'whatsapp', 'movil', 'telefonodecontacto'],
  court: ['cancha'],
  day: ['dia', 'diadelasemana'],
  start: ['desde', 'horainicio', 'horadeinicio', 'inicio', 'hora', 'horario'],
  end: ['hasta', 'horafin', 'horadefin', 'fin'],
  price: ['precio', 'precioporturno', 'preciodelturno', 'valor', 'monto', 'tarifa', 'importe'],
}

/**
 * 0 = domingo, igual que `abonados.day_of_week` y `getUTCDay()`. Un `Map` y no
 * un objeto: con un objeto, «constructor» o «toString» encontraban algo.
 */
const DAY_NAMES = new Map<string, number>([
  ['domingo', 0],
  ['dom', 0],
  ['lunes', 1],
  ['lun', 1],
  ['martes', 2],
  ['mar', 2],
  ['miercoles', 3],
  ['mie', 3],
  ['mier', 3],
  ['jueves', 4],
  ['jue', 4],
  ['viernes', 5],
  ['vie', 5],
  ['sabado', 6],
  ['sab', 6],
])

/** Minúsculas, sin tildes y sin nada que no sea letra o número. */
function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// ── Tabla ─────────────────────────────────────────────────────────────────

export type ParsedTable = {
  delimiter: string
  header: string[]
  /** Solo las filas con algún dato; `line` respeta la numeración de la planilla. */
  rows: Array<{ line: number; cells: string[] }>
  /** Fila donde se abrió una comilla que nunca se cerró; `null` si no pasó. */
  unclosedQuoteLine: number | null
}

/**
 * Lo que se pega desde Excel o Sheets viene separado por tabulaciones; un .csv
 * de Excel en es-AR, por `;`; uno de Sheets, por `,`. Se decide mirando la
 * primera línea, que es el encabezado.
 */
function detectDelimiter(firstLine: string): string {
  if (firstLine.includes('\t')) return '\t'
  const semicolons = firstLine.split(';').length - 1
  const commas = firstLine.split(',').length - 1
  return semicolons >= commas && semicolons > 0 ? ';' : ','
}

/**
 * Celdas separadas por `delimiter`, con comillas dobles a la RFC 4180: una celda
 * que arranca con `"` puede traer separadores y saltos de línea adentro, y `""`
 * es una comilla. Es lo que escriben Excel y Sheets al copiar o exportar.
 */
export function parseDelimitedText(input: string): ParsedTable {
  const text = input.replace(/^\uFEFF/, '')
  // La primera con algo: una l\u00EDnea en blanco arriba del encabezado no tiene separador.
  const firstLine = text.split(/\r\n|\n|\r/).find((l) => l.trim() !== '') ?? ''
  const delimiter = detectDelimiter(firstLine)

  const records: string[][] = []
  let record: string[] = []
  let cell = ''
  let inQuotes = false
  let quoteLine = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"' && cell === '') {
      inQuotes = true
      quoteLine = records.length + 1
    } else if (ch === delimiter) {
      record.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      record.push(cell)
      records.push(record)
      record = []
      cell = ''
    } else {
      cell += ch
    }
  }
  record.push(cell)
  records.push(record)

  const numbered = records.map((cells, i) => ({ line: i + 1, cells: cells.map((c) => c.trim()) }))
  const nonEmpty = numbered.filter((r) => r.cells.some((c) => c !== ''))
  const [header, ...rows] = nonEmpty
  return {
    delimiter,
    header: header?.cells ?? [],
    rows,
    unclosedQuoteLine: inQuotes ? quoteLine : null,
  }
}

/**
 * De vuelta a texto. Por defecto TSV, como lo que se pega: así vuelven a la caja
 * las filas que quedaron afuera. Con `;` es el CSV que abre Excel en es-AR (la
 * plantilla para descargar).
 */
export function serializeTable(
  header: string[],
  rows: string[][],
  delimiter: '\t' | ';' = '\t',
): string {
  const quote = (c: string) =>
    c.includes(delimiter) || /[\n\r"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c
  return [header, ...rows].map((cells) => cells.map(quote).join(delimiter)).join('\n')
}

// ── Celdas ────────────────────────────────────────────────────────────────

type CellResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseDay(raw: string): CellResult<number> {
  const key = normalizeKey(raw)
  // "Sábados", "Domingos": el plural de los que no terminan en s.
  const day = DAY_NAMES.get(key) ?? DAY_NAMES.get(key.replace(/s$/, ''))
  if (day === undefined) return { ok: false, error: `No se entiende el día «${raw}» (ej: Lunes)` }
  return { ok: true, value: day }
}

/** `8pm`, `8p.m.`: sobre la hora en minúsculas y sin espacios. */
const MERIDIEM_RE = /^(.*?)(a|p)\.?m\.?$/

function hasMeridiem(raw: string): boolean {
  return MERIDIEM_RE.test(raw.toLowerCase().replace(/\s+/g, ''))
}

/**
 * Una hora de la planilla, en minutos desde la medianoche: `20`, `20hs`,
 * `20:00`, `20.00`, `20:00:00`, `8 p. m.`. Solo horas enteras, como los turnos
 * (`SLOT_DURATION_MINUTES`). Como FIN, `0`, `00:00` y `24` son la medianoche
 * del final del día (1440, que se guarda `'24:00'`).
 */
export function parseHour(raw: string, kind: 'start' | 'end'): CellResult<number> {
  const invalid = { ok: false as const, error: `No se entiende la hora «${raw}» (ej: 20:00)` }
  let s = raw.toLowerCase().replace(/\s+/g, '')
  const meridiem = MERIDIEM_RE.exec(s)
  if (meridiem) s = meridiem[1]!
  s = s.replace(/(hs|hrs|h)\.?$/, '')
  const m = /^(\d{1,2})(?:[:.](\d{2}))?(?::(\d{2}))?$/.exec(s)
  if (!m) return invalid
  let hour = Number(m[1])
  const minutes = Number(m[2] ?? 0)
  const seconds = Number(m[3] ?? 0)
  if (minutes >= 60 || seconds >= 60) return invalid
  if (meridiem) {
    if (hour < 1 || hour > 12) return invalid
    hour = (hour % 12) + (meridiem[2] === 'p' ? 12 : 0)
  }
  if (minutes !== 0 || seconds !== 0) {
    return { ok: false, error: `Los turnos van en horas enteras: «${raw}» (ej: 20:00)` }
  }
  if (kind === 'start') {
    if (hour > 23) return invalid
    return { ok: true, value: hour * 60 }
  }
  if (hour > 24) return invalid
  return { ok: true, value: hour === 0 ? END_OF_DAY_MINS : hour * 60 }
}

/** «20 a 21», «20-21», «de 20:00 a 21:00»: un rango entero en la columna Desde. */
function splitHourRange(raw: string): [string, string] | null {
  const parts = raw
    .replace(/^de\s+/i, '')
    .split(/\s+(?:a|hasta)\s+|\s*[-–—]\s*/i)
    .filter((p) => p !== '')
  return parts.length === 2 ? [parts[0]!, parts[1]!] : null
}

/** El máximo de `abonados.price_per_session` (integer de Postgres). */
const MAX_PRICE_CENTS = 2_147_483_647

/**
 * Pesos de la planilla → centavos, sin pasar por float: `25000`, `25.000`,
 * `$ 25.000`, `25.000,50` (es-AR), y también `25,000.50` o `25000.5` (lo que
 * exporta una planilla en inglés).
 */
export function parsePriceCents(raw: string): CellResult<number> {
  const s = raw.replace(/\s/g, '').replace(/^ars/i, '').replace(/\$/g, '')
  let intPart: string
  let decPart = ''
  let m: RegExpExecArray | null
  if ((m = /^(\d+)$/.exec(s))) {
    intPart = m[1]!
  } else if ((m = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(s))) {
    intPart = m[1]!.replace(/\./g, '')
    decPart = m[2] ?? ''
  } else if ((m = /^(\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/.exec(s))) {
    intPart = m[1]!.replace(/,/g, '')
    decPart = m[2] ?? ''
  } else if ((m = /^(\d+)[.,](\d{1,2})$/.exec(s))) {
    intPart = m[1]!
    decPart = m[2]!
  } else {
    return { ok: false, error: `No se entiende el precio «${raw}» (ej: 25.000)` }
  }
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'))
  if (cents <= 0) return { ok: false, error: 'El precio por turno tiene que ser mayor a $ 0' }
  if (cents > MAX_PRICE_CENTS) return { ok: false, error: `El precio «${raw}» es demasiado alto` }
  return { ok: true, value: cents }
}

/** Dígitos con espacios, guiones, puntos o paréntesis, y un `+` adelante si trae el país. */
const PHONE_SHAPE_RE = /^\+?\(?\d[\d ().-]*$/
/** E.164: ningún teléfono tiene más dígitos, código de país incluido. */
const MAX_PHONE_DIGITS = 15

/**
 * Solo el número. Una celda con letras («11 5555-5555 (mamá)», «tel: …»), con
 * dos números o con lo que Excel hace con un número largo (`5,49112E+12`,
 * `1155555555.0`) se rechaza entera en vez de limpiarse: lo que no es el número
 * sería texto libre sobre la persona (Ley 25.326).
 *
 * Se guarda como el alta manual: `parsePhoneNumber` + `formatFullPhone`, los
 * mismos de `PhoneInput`, que dejan `+54 <nacional>` y sacan el 54 y el 9 de
 * móvil si la planilla los trae, con `+` o sin él. Puntos, paréntesis y guiones
 * entre dígitos pasan a espacios. La identidad de la persona la deciden los
 * últimos dígitos (`normalizeContactPhone`), no esto.
 */
export function parsePhone(cell: string): CellResult<string> {
  // El espacio duro (NBSP) que deja Sheets cuenta como espacio. Los saltos de
  // línea no: son dos números en la celda.
  const raw = cell.replace(/[^\S\r\n]+/g, ' ').trim()
  if (/^[\d.,]+e\+?\d+$/i.test(raw) || /^\d{6,}[.,]0+$/.test(raw)) {
    return {
      ok: false,
      error: `Excel convirtió el teléfono en «${raw}»: poné la columna como texto y copiala de nuevo`,
    }
  }
  if (!PHONE_SHAPE_RE.test(raw)) {
    return {
      ok: false,
      error: 'El teléfono va solo con números, uno por fila y sin notas (ej: 11 2345-6789)',
    }
  }
  // Los guiones entre grupos de dígitos también: «+54-11-5555-5555» quedaba
  // «+54 -11-5555-5555», porque `parsePhoneNumber` solo corta el código de país.
  const cleaned = raw
    .replace(/[().]/g, ' ')
    .replace(/(\d) *- *(?=\d)/g, '$1 ')
    .replace(/ +/g, ' ')
    .trim()
  const { country, nationalNumber } = parsePhoneNumber(cleaned)
  // Un `+` con un código de país que el input no conoce queda como vino.
  const unknownCountry = nationalNumber.startsWith('+')
  const phone = unknownCountry ? cleaned : formatFullPhone(country, nationalNumber)
  if ((unknownCountry ? cleaned : nationalNumber).replace(/\D/g, '').length < 8) {
    return { ok: false, error: 'El teléfono tiene que tener al menos 8 números' }
  }
  if (phone.replace(/\D/g, '').length > MAX_PHONE_DIGITS || phone.length > 40) {
    return { ok: false, error: 'El teléfono tiene demasiados números: va uno solo por fila' }
  }
  return { ok: true, value: phone }
}

export type ImportCourt = { id: string; name: string }

/**
 * La cancha por su nombre (sin mayúsculas ni tildes) o, si viene solo un número,
 * la única cancha cuyo nombre termina en ese número ("3" → "Cancha 3").
 */
export function matchCourt(raw: string, courts: ImportCourt[]): CellResult<ImportCourt> {
  const key = normalizeKey(raw)
  const exact = courts.filter((c) => normalizeKey(c.name) === key)
  if (exact.length === 1) return { ok: true, value: exact[0]! }
  if (/^\d+$/.test(raw)) {
    const byNumber = courts.filter((c) => Number(/(\d+)\s*$/.exec(c.name)?.[1]) === Number(raw))
    if (byNumber.length === 1) return { ok: true, value: byNumber[0]! }
  }
  const names = courts.map((c) => c.name).join(', ')
  return { ok: false, error: `No hay una cancha «${raw}». Tus canchas: ${names}` }
}

// ── Filas ─────────────────────────────────────────────────────────────────

type ValidatedRow = {
  line: number
  cells: string[]
  raw: Partial<Record<ImportField, string>>
  value: ImportRowValue | null
  errors: string[]
}

export type ValidatedImport =
  | { ok: true; table: ParsedTable; rows: ValidatedRow[]; ignoredColumns: string[] }
  | { ok: false; error: string }

/**
 * Qué columna es cada campo. Las que no son ninguno, o repiten uno ya tomado
 * (un segundo "Celular"), se ignoran y se devuelven para avisarlo: un "Apellido"
 * aparte, por ejemplo, no llega al nombre.
 */
function mapHeader(header: string[]): {
  columns: Partial<Record<ImportField, number>>
  ignored: string[]
} {
  const columns: Partial<Record<ImportField, number>> = {}
  const ignored: string[] = []
  header.forEach((cell, index) => {
    const key = normalizeKey(cell)
    const field = (Object.keys(HEADER_SYNONYMS) as ImportField[]).find((f) =>
      HEADER_SYNONYMS[f].includes(key),
    )
    if (field && columns[field] === undefined) columns[field] = index
    else if (cell !== '') ignored.push(cell)
  })
  return { columns, ignored }
}

function joinLabels(labels: string[]): string {
  return labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(', ')} y ${labels.at(-1)}`
}

function validateRow(
  line: number,
  cells: string[],
  columns: Partial<Record<ImportField, number>>,
  courts: ImportCourt[],
  closesNextDay: boolean,
): ValidatedRow {
  const raw: Partial<Record<ImportField, string>> = {}
  for (const field of Object.keys(columns) as ImportField[]) {
    raw[field] = cells[columns[field]!] ?? ''
  }
  const errors: string[] = []
  const missing = REQUIRED_FIELDS.filter((f) => !raw[f])
  if (missing.length > 0) {
    errors.push(`Falta completar ${joinLabels(missing.map((f) => FIELD_LABELS[f]))}`)
  }

  const contactName = raw.name ?? ''
  if (contactName.length > 120) errors.push('El nombre es demasiado largo (máximo 120 letras)')
  // Una celda entre comillas puede traer saltos de línea: en el nombre son una
  // nota pegada abajo.
  if (/[\r\n]/.test(contactName)) errors.push('El nombre ocupa más de una línea: va en una sola')

  const phone = raw.phone ? parsePhone(raw.phone) : null
  if (phone && !phone.ok) errors.push(phone.error)
  const court = raw.court ? matchCourt(raw.court, courts) : null
  if (court && !court.ok) errors.push(court.error)
  const day = raw.day ? parseDay(raw.day) : null
  if (day && !day.ok) errors.push(day.error)

  let startRaw = raw.start ?? ''
  let endRaw = raw.end ?? ''
  if (startRaw && !endRaw) {
    const range = splitHourRange(startRaw)
    if (range) [startRaw, endRaw] = range
  }
  // «8 a 9 pm» sería de 08:00 a 21:00, la cancha tomada 13 horas por semana. Y
  // pasarle el pm a la otra mitad tampoco sirve: «11 a 12 pm» no se sabe qué es.
  const mixedMeridiem = !!startRaw && !!endRaw && hasMeridiem(startRaw) !== hasMeridiem(endRaw)
  if (mixedMeridiem) errors.push('Indicá am/pm en las dos horas (ej: 8 pm a 9 pm)')
  const start = startRaw && !mixedMeridiem ? parseHour(startRaw, 'start') : null
  if (start && !start.ok) errors.push(start.error)
  // Sin "Hasta", el turno dura una hora: el turno de la reserva online.
  const end = mixedMeridiem
    ? null
    : endRaw
      ? parseHour(endRaw, 'end')
      : start?.ok
        ? { ok: true as const, value: start.value + 60 }
        : null
  if (end && !end.ok) errors.push(end.error)
  if (start?.ok && end?.ok && end.value <= start.value) {
    // Mismo límite que el alta manual (`chk_time_valid`): un fijo nunca cruza la
    // medianoche, así que "23 a 1" son dos filas. La segunda depende del complejo:
    // si cierra pasada la medianoche, el día es el OPERATIVO (`operating-day.ts`)
    // y la madrugada del martes es "Lunes 00 a 01"; si no, es "Martes 00 a 01".
    errors.push(
      end.value >= start.value
        ? 'La hora de fin tiene que ser posterior a la de inicio'
        : closesNextDay
          ? 'Un turno fijo no puede pasar la medianoche: cargalo en dos filas del mismo día, una hasta las 00:00 y otra desde las 00:00 (la madrugada cuenta como la noche de ese día)'
          : 'Un turno fijo no puede pasar la medianoche: cargalo en dos filas, una hasta las 00:00 y otra desde las 00:00 del día siguiente',
    )
  }

  const price = raw.price ? parsePriceCents(raw.price) : null
  if (price && !price.ok) errors.push(price.error)

  const value: ImportRowValue | null =
    errors.length === 0 && phone?.ok && court?.ok && day?.ok && start?.ok && end?.ok && price?.ok
      ? {
          contactName,
          contactPhone: phone.value,
          courtId: court.value.id,
          courtName: court.value.name,
          dayOfWeek: day.value,
          timeStart: startLabelFromMins(start.value),
          timeEnd: endLabelFromMins(end.value),
          pricePerSession: price.value,
        }
      : null
  return { line, cells, raw, value, errors }
}

/** Dos filas de la planilla en la misma cancha, el mismo día y horarios que se pisan. */
function markOverlaps(rows: ValidatedRow[]): void {
  const accepted: ValidatedRow[] = []
  for (const row of rows) {
    const v = row.value
    if (!v) continue
    const clash = accepted.find((other) => {
      const o = other.value!
      return (
        o.courtId === v.courtId &&
        o.dayOfWeek === v.dayOfWeek &&
        hhmmToMins(v.timeStart) < hhmmToMins(o.timeEnd) &&
        hhmmToMins(v.timeEnd) > hhmmToMins(o.timeStart)
      )
    })
    if (clash) {
      row.errors.push(`Se pisa con la fila ${clash.line}: misma cancha, mismo día y horario`)
      row.value = null
    } else {
      accepted.push(row)
    }
  }
}

/**
 * La planilla entera: encabezado, tope de filas y cada fila contra las canchas.
 * `closesNextDay` solo cambia cómo se explica un turno que cruza la medianoche.
 */
export function validateImportText(
  text: string,
  courts: ImportCourt[],
  { closesNextDay = false }: { closesNextDay?: boolean } = {},
): ValidatedImport {
  const table = parseDelimitedText(text)
  // Todo lo que viene después de esa comilla quedó adentro de una sola celda,
  // aunque sea de una columna que se ignora: las filas de abajo se perderían.
  if (table.unclosedQuoteLine !== null) {
    return {
      ok: false,
      error: `La fila ${table.unclosedQuoteLine} abre unas comillas (") que nunca se cierran, y se tragan las filas de abajo. Borrá esa comilla y revisá de nuevo.`,
    }
  }
  if (table.header.length === 0) {
    return {
      ok: false,
      error: 'Pegá la planilla, con los nombres de las columnas en la primera fila.',
    }
  }
  if (courts.length === 0) {
    return { ok: false, error: 'Todavía no hay canchas cargadas en el complejo.' }
  }
  const { columns, ignored } = mapHeader(table.header)
  const missing = REQUIRED_FIELDS.filter((f) => columns[f] === undefined)
  if (missing.length > 0) {
    const labels = joinLabels(missing.map((f) => `«${FIELD_LABELS[f]}»`))
    return {
      ok: false,
      error: `${missing.length === 1 ? 'Falta la columna' : 'Faltan las columnas'} ${labels}. La primera fila tiene que tener los nombres de las columnas, como en la plantilla.`,
    }
  }
  if (table.rows.length === 0) {
    return { ok: false, error: 'La planilla tiene los nombres de las columnas pero ninguna fila.' }
  }
  if (table.rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `La planilla tiene ${table.rows.length} filas y el máximo es ${MAX_IMPORT_ROWS} por vez. Cargala en partes.`,
    }
  }
  const rows = table.rows.map((r) => validateRow(r.line, r.cells, columns, courts, closesNextDay))
  markOverlaps(rows)
  return { ok: true, table, rows, ignoredColumns: ignored }
}
