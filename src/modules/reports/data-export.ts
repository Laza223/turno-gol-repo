/**
 * Export de datos del complejo (feature #9): reservas, turnos fijos y clientes
 * en CSV para Excel y Google Sheets. Lógica pura — las queries viven en
 * `src/app/(admin)/settings/datos/queries.ts` y las Server Actions al lado.
 * Diseño: `docs/superpowers/specs/2026-10-22-export-datos-complejo-design.md`.
 *
 * El formato apunta a Excel en es-AR, que es donde lo abre el dueño:
 * - `;` como separador. Excel usa el separador de lista del sistema, y en es-AR
 *   la coma es el decimal: un CSV con `,` abre con todo en la columna A.
 * - BOM UTF-8 al principio: sin él, Excel lee el archivo como ANSI y rompe
 *   eñes y tildes.
 * - Montos en pesos con coma decimal y sin separador de miles, que Excel es-AR
 *   toma como número.
 * - Fechas ISO (`AAAA-MM-DD`): Excel y Sheets las reconocen como fecha en
 *   cualquier configuración regional. `DD/MM/AAAA` en un Excel en inglés
 *   convierte el 05/10 en 10 de mayo sin avisar.
 */
import { PLAYER_TAG_LABELS, type PlayerTag } from '@/modules/relationships/player-tags'
import type { BookingStatus, BookingType, DepositStatus } from '@/modules/bookings/booking.types'
import { bookingBadgeVisual } from '@/lib/booking/slot-visual'
import { bookingCode } from '@/lib/booking-code'
import type { AbonadoPaymentMethod, AbonadoStatus } from '@/modules/abonados/abonado.types'
import { csvCell } from './report.utils'

const SEPARATOR = ';'
const EOL = '\r\n'
const BOM = '\uFEFF'

type Cell = string | number | null

/** Una línea CSV con el separador del export, con el escape anti fórmulas de `csvCell`. */
export function csvLine(cells: readonly Cell[]): string {
  return cells.map((c) => csvCell(c, SEPARATOR)).join(SEPARATOR)
}

/**
 * El archivo entero: BOM + encabezado + los cuerpos que llegaron de cada
 * llamada (las reservas vienen por páginas). Un cuerpo vacío no deja una
 * línea en blanco en el medio.
 */
export function assembleCsvFile(header: string, bodies: readonly string[]): string {
  return BOM + [header, ...bodies.filter((b) => b.length > 0)].join(EOL)
}

/** Varias líneas ya escapadas, unidas como cuerpo de un pedazo del archivo. */
export function csvBody(rows: readonly (readonly Cell[])[]): string {
  return rows.map(csvLine).join(EOL)
}

/** Centavos → pesos con coma decimal y sin miles: `1500000` → `15000`, `1500050` → `15000,50`. */
export function pesosCell(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(cents))
  const pesos = Math.floor(abs / 100)
  const rest = abs % 100
  return rest === 0 ? `${sign}${pesos}` : `${sign}${pesos},${String(rest).padStart(2, '0')}`
}

/**
 * `HH:MM:SS` de Postgres → `HH:MM`. El `24:00` de un turno que termina a la
 * medianoche en un complejo que cierra pasado el día (CLAUDE.md, día operativo)
 * sale `00:00`, que es como lo escribe una persona ("de 23 a 00").
 */
export function hhmmCell(time: string): string {
  const hhmm = time.slice(0, 5)
  return hhmm === '24:00' ? '00:00' : hhmm
}

/** `Date` de una columna `date` (medianoche UTC) → `AAAA-MM-DD` sin correrse de día. */
export function isoDateCell(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : ''
}

// ─── Reservas ───────────────────────────────────────────────────────────────

export const BOOKINGS_EXPORT_HEADER = csvLine([
  'N.° de reserva',
  'Fecha',
  'Desde',
  'Hasta',
  'Cancha',
  'Tipo',
  'Estado',
  'Cliente',
  'Teléfono',
  'Precio',
  'Seña',
  'Cobrado',
])

export type BookingExportSource = {
  id: string
  /** Día OPERATIVO (`bookings.date`), ya como `AAAA-MM-DD`. */
  date: string
  timeStart: string
  timeEnd: string
  courtName: string
  type: BookingType
  status: BookingStatus
  depositStatus: DepositStatus
  /** La creó el asistente de WhatsApp (`whatsapp_chat_id` no nulo). */
  viaWhatsapp: boolean
  /** La cargó alguien del complejo (`created_by_staff` no nulo). */
  byStaff: boolean
  clientName: string | null
  phone: string | null
  /** Centavos. */
  priceSnapshot: number
  /** Centavos. */
  depositAmount: number
  /** Centavos: seña que quedó en el complejo + cobros de mostrador (`summarizeBookingCharges`). */
  totalPaid: number
}

/**
 * De dónde salió la reserva. `created_by_staff` NULL no alcanza para decir
 * "online": los turnos de un fijo y los del bot también nacen con NULL ahí
 * (memoria del repo `created-by-staff-null-no-es-online`). Por eso el tipo
 * manda y el NULL solo decide entre las sueltas.
 */
export function bookingKindLabel(b: Pick<BookingExportSource, 'type' | 'viaWhatsapp' | 'byStaff'>) {
  switch (b.type) {
    case 'fixed':
      return 'Turno fijo'
    case 'block':
      return 'Bloqueo'
    case 'tournament':
      return 'Torneo'
    case 'spontaneous':
      if (b.viaWhatsapp) return 'WhatsApp'
      return b.byStaff ? 'Panel' : 'Online'
  }
}

/**
 * Un bloqueo no es una reserva de nadie y nunca carga plata (CLAUDE.md, turno
 * de 60 min): sale con cliente y montos vacíos en vez de `0`, que en una
 * planilla se suma como si fuera un turno regalado.
 */
export function bookingExportRow(b: BookingExportSource): Cell[] {
  const isBlock = b.type === 'block'
  return [
    bookingCode(b.id),
    b.date,
    hhmmCell(b.timeStart),
    hhmmCell(b.timeEnd),
    b.courtName,
    bookingKindLabel(b),
    bookingBadgeVisual(b).label,
    isBlock ? '' : (b.clientName ?? ''),
    isBlock ? '' : (b.phone ?? ''),
    isBlock ? '' : pesosCell(b.priceSnapshot),
    isBlock || b.depositAmount === 0 ? '' : pesosCell(b.depositAmount),
    isBlock ? '' : pesosCell(b.totalPaid),
  ]
}

// ─── Turnos fijos ───────────────────────────────────────────────────────────

/** Índice = `abonados.day_of_week` (0 = domingo, como `getUTCDay`). */
const WEEKDAY_LABEL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const ABONADO_STATUS_LABEL: Record<AbonadoStatus, string> = {
  active: 'Activo',
  paused: 'Pausado',
  canceled: 'Cancelado',
}

const ABONADO_PAYMENT_LABEL: Record<AbonadoPaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
}

export const ABONADOS_EXPORT_HEADER = csvLine([
  'Cliente',
  'Teléfono',
  'Día',
  'Desde',
  'Hasta',
  'Cancha',
  'Precio por turno',
  'Forma de pago',
  'Estado',
  'Empieza',
  'Termina',
])

export type AbonadoExportSource = {
  contactName: string
  contactPhone: string | null
  dayOfWeek: number
  timeStart: string
  timeEnd: string
  courtName: string
  /** Centavos. */
  pricePerSession: number
  paymentMethod: AbonadoPaymentMethod
  status: AbonadoStatus
  startsOn: Date
  endsOn: Date | null
}

export function abonadoExportRow(a: AbonadoExportSource): Cell[] {
  return [
    a.contactName,
    a.contactPhone ?? '',
    WEEKDAY_LABEL[a.dayOfWeek] ?? '',
    hhmmCell(a.timeStart),
    hhmmCell(a.timeEnd),
    a.courtName,
    pesosCell(a.pricePerSession),
    ABONADO_PAYMENT_LABEL[a.paymentMethod] ?? a.paymentMethod,
    ABONADO_STATUS_LABEL[a.status] ?? a.status,
    isoDateCell(a.startsOn),
    isoDateCell(a.endsOn),
  ]
}

// ─── Clientes ───────────────────────────────────────────────────────────────

export const CLIENTS_EXPORT_HEADER = csvLine([
  'Nombre',
  'Teléfono',
  'Email',
  'Cuenta en TurnoGol',
  'Reservas',
  'Ausencias',
  'Última reserva',
  'Turnos fijos',
  'Etiquetas',
])

export type ClientExportSource = {
  kind: 'player' | 'contact'
  name: string
  email: string | null
  phone: string | null
  bookingsCount: number
  noshowCount: number
  /** `AAAA-MM-DD`, tal como la muestra `/jugadores`. */
  lastBookingAt: string | null
  fixedCount: number
  tags: readonly PlayerTag[]
}

/**
 * Las etiquetas salen con su label, nunca con el enum: es el mismo set cerrado
 * de 5 que ve el dueño en la ficha (Ley 25.326, `player-tags.ts`). Email y
 * etiquetas salen por decisión de Lazar (spec §6.2): la política de privacidad
 * ya dice que el complejo accede a nombre, email y teléfono de sus clientes.
 */
export function clientExportRow(c: ClientExportSource): Cell[] {
  return [
    c.name,
    c.phone ?? '',
    c.email ?? '',
    c.kind === 'player' ? 'Sí' : 'No',
    c.bookingsCount,
    c.noshowCount,
    c.lastBookingAt ?? '',
    c.fixedCount,
    c.tags.map((t) => PLAYER_TAG_LABELS[t]).join(' · '),
  ]
}
