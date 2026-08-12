import {
  Ban,
  CheckCheck,
  CheckCircle2,
  Clock,
  HandCoins,
  HelpCircle,
  Repeat,
  Trophy,
  UserX,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import {
  TONE_ACCENT,
  TONE_BORDER,
  TONE_SWATCH,
  TONE_TEXT,
  TONE_TINT,
  TONE_TINT_STRONG,
  type StatusTone,
} from '@/lib/status-tone'
import type { BookingStatus, BookingType, DepositStatus } from '@/modules/bookings/booking.types'

/**
 * Fuente ÚNICA de "qué estado muestra este turno" — grilla, leyenda y listado.
 *
 * Antes de Fase 3 esto vivía en tres lugares que se sincronizaban a mano
 * (`BookingCard.slotVisual`, `GridLegend.GRID_LEGEND`, `reservas/status-visual`)
 * y ya habían divergido en las opacidades de los tintes. La regla de lectura no
 * cambió (MASTER §2.6 + pages/grilla.md §2): **el COLOR comunica el estado de
 * la plata, el ÍCONO + label comunican qué es.**
 *
 * Lo que sí cambia en Fase 3 es que el semáforo ahora dice la verdad completa:
 * existe un estado de ALARMA para el turno que ya se prestó y no se cobró, que
 * antes se pintaba igual que uno cobrado.
 */

export type SlotStateKey =
  | 'tournament'
  | 'block'
  | 'unpaid_alarm'
  | 'no_show'
  | 'completed'
  | 'pending_payment'
  | 'deposit_paid'
  | 'fixed'
  | 'confirmed'
  | 'canceled'
  | 'expired'
  | 'unknown'

/**
 * Los hechos del turno que determinan su estado visual. `pending`/`totalPaid`
 * son opcionales a propósito: los payloads que no los traen (Realtime crudo,
 * fixtures viejas) degradan al comportamiento previo a Fase 3 en vez de mentir
 * con una alarma que no pueden justificar.
 */
export type SlotFacts = {
  status: BookingStatus | string
  type: BookingType | string
  depositStatus?: DepositStatus | string | null
  /** Saldo pendiente en centavos (price_snapshot − cobrado). */
  pending?: number | null
  /** Total cobrado en centavos: seña contada + cobros de mostrador. */
  totalPaid?: number | null
}

type SlotStateMeta = {
  label: string
  icon: LucideIcon
  tone: StatusTone
  /** Rayado diagonal: "esto no es la reserva de un jugador". */
  striped?: boolean
  /** Tinte reforzado — marca el remate de un ciclo, no un estado más. */
  strongTint?: boolean
  /** Pide atención activa del staff (la ÚNICA alarma visual de la grilla). */
  alarm?: boolean
  /** Aparece en la leyenda de la grilla, en este orden. */
  inLegend?: boolean
}

const SLOT_STATES: Record<SlotStateKey, SlotStateMeta> = {
  pending_payment: {
    // Decisión v2 D1: la grilla del staff marca "pagando ahora". "Esperando
    // seña" se leía como una espera indefinida; esto es una ventana de 6 min
    // que se libera sola, y el encargado necesita saber cuál de las dos es.
    label: 'Pagando ahora',
    icon: Clock,
    tone: 'warning',
    inLegend: true,
  },
  confirmed: {
    label: 'Confirmada',
    icon: HandCoins,
    tone: 'info',
    inLegend: true,
  },
  deposit_paid: {
    label: 'Señada',
    icon: CheckCircle2,
    tone: 'success',
    inLegend: true,
  },
  completed: {
    label: 'Jugada',
    icon: CheckCheck,
    tone: 'success',
    strongTint: true,
    inLegend: true,
  },
  unpaid_alarm: {
    label: 'Sin cobrar',
    icon: CheckCheck,
    tone: 'destructive',
    alarm: true,
    inLegend: true,
  },
  no_show: {
    label: 'Ausente',
    icon: UserX,
    tone: 'destructive',
    inLegend: true,
  },
  fixed: {
    label: 'Abonado',
    icon: Repeat,
    tone: 'info',
    inLegend: true,
  },
  tournament: {
    label: 'Torneo',
    icon: Trophy,
    tone: 'warning',
    striped: true,
    inLegend: true,
  },
  block: {
    label: 'Bloqueado',
    icon: Ban,
    tone: 'neutral',
    striped: true,
    inLegend: true,
  },
  // Los tres de abajo NUNCA llegan a la grilla: la query de /grilla filtra por
  // status y un turno cancelado o expirado vuelve a leerse como libre en el
  // acto (es re-reservable, así que "libre" es lo correcto). Viven acá porque
  // el listado de /reservas sí los muestra, y ese historial es el único lugar
  // donde queda rastro de la cancelación.
  canceled: { label: 'Cancelada', icon: XCircle, tone: 'neutral' },
  expired: { label: 'Expirada', icon: XCircle, tone: 'neutral' },
  unknown: { label: 'Estado desconocido', icon: HelpCircle, tone: 'neutral' },
}

/**
 * ¿Este turno terminado se quedó sin cobrar?
 *
 * Decisión de producto (2026-08-04): la alarma significa **plata en cero o
 * incompleta**, no "algo salió mal".
 * - `completed` con saldo pendiente → alarma: el servicio se prestó y falta plata.
 * - `no_show` que capturó la seña → SIN alarma: en un no-show la seña es lo único
 *   cobrable, y ya se cobró. No hay nada que el staff pueda hacer.
 * - `no_show` sin un peso cobrado → alarma: quedó en cero.
 *
 * Sin datos de plata (`pending`/`totalPaid` ausentes) NO se dispara: una alarma
 * falsa entrena al staff a ignorarlas.
 */
function isUnpaidAlarm(facts: SlotFacts): boolean {
  if (facts.status === 'completed') {
    return typeof facts.pending === 'number' && facts.pending > 0
  }
  if (facts.status === 'no_show') {
    return typeof facts.totalPaid === 'number' && facts.totalPaid <= 0
  }
  return false
}

/**
 * El estado visual del turno. NO es 1:1 con `booking_status`: cruza estado,
 * tipo, seña y plata cobrada.
 *
 * Orden de prioridad (el primero que matchea gana):
 * torneo → bloqueo → **alarma** → ausente → jugada → esperando seña → señada →
 * abonado → cancelada/expirada → confirmada.
 *
 * La alarma va antes que `no_show`/`completed` porque justamente refina a esos
 * dos; abajo de ellos no se dispararía nunca. Torneo y bloqueo van primero
 * porque no son la reserva de un jugador y ninguna rama de plata los describe
 * bien (ambos tienen `price_snapshot = 0`, así que tampoco pueden alarmar).
 */
export function slotStateKey(facts: SlotFacts): SlotStateKey {
  if (facts.type === 'tournament') return 'tournament'
  if (facts.type === 'block') return 'block'
  if (isUnpaidAlarm(facts)) return 'unpaid_alarm'
  if (facts.status === 'no_show') return 'no_show'
  if (facts.status === 'completed') return 'completed'
  if (facts.status === 'pending_payment') return 'pending_payment'
  if (facts.status === 'canceled_refunded' || facts.status === 'canceled_no_refund')
    return 'canceled'
  if (facts.status === 'expired') return 'expired'
  if (facts.status === 'confirmed') {
    if (facts.depositStatus === 'paid' || facts.depositStatus === 'captured') return 'deposit_paid'
    if (facts.type === 'fixed') return 'fixed'
    return 'confirmed'
  }
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Vista 1 — celda de la grilla
// ---------------------------------------------------------------------------

export type GridSlotVisual = {
  key: SlotStateKey
  label: string
  icon: LucideIcon
  tone: StatusTone
  /** Tinte de fondo de la celda (+ rayado si corresponde). */
  cell: string
  /** Borde izquierdo de 3px: identificador primario, legible para daltónicos. */
  borderL: string
  /** Color del label de estado. */
  labelText: string
  /** Requiere el tratamiento de alarma (anillo pulsante + punto). */
  alarm: boolean
}

export function gridSlotVisual(facts: SlotFacts): GridSlotVisual {
  const key = slotStateKey(facts)
  const meta = SLOT_STATES[key]
  const tint = meta.strongTint ? TONE_TINT_STRONG[meta.tone] : TONE_TINT[meta.tone]
  return {
    key,
    label: meta.label,
    icon: meta.icon,
    tone: meta.tone,
    cell: meta.striped ? `slot-blocked-stripes ${tint}` : tint,
    borderL: TONE_BORDER[meta.tone],
    labelText: TONE_TEXT[meta.tone],
    alarm: meta.alarm === true,
  }
}

// ---------------------------------------------------------------------------
// Vista 2 — badge del listado (/reservas)
// ---------------------------------------------------------------------------

export type BookingBadgeVisual = {
  key: SlotStateKey
  label: string
  icon: LucideIcon
  tone: StatusTone
  /** Barra de acento sólida (tira lateral del ítem). */
  accent: string
  /**
   * El turno terminó sin cobrar. En el listado esto NO reemplaza al label: es
   * un flag para pintar un indicador APARTE, al lado del badge de estado.
   */
  unpaid: boolean
}

/**
 * La píldora de plata del listado y del detalle. Sale de la MISMA fila de
 * `SLOT_STATES` que pinta la alarma de la grilla, así que las dos superficies
 * no pueden decir cosas distintas de la misma situación.
 */
export const UNPAID_ALARM_BADGE = {
  label: SLOT_STATES.unpaid_alarm.label,
  icon: SLOT_STATES.unpaid_alarm.icon,
  tone: SLOT_STATES.unpaid_alarm.tone,
} as const

/**
 * El listado NO distingue "Señada" de "Confirmada": el detalle de la seña ya
 * vive en la línea secundaria de cada ítem, y repetirlo en el badge le sacaría
 * peso al dato que sí importa ahí. La grilla sí las distingue porque el color
 * es lo único que tiene. Esta divergencia es deliberada — no aplanarla.
 *
 * La alarma de plata viaja al listado como **flag** (`unpaid`), NUNCA como
 * label. La diferencia es el contrato entero de esta función:
 *
 * - En la grilla la alarma REEMPLAZA al label, porque una celda tiene lugar
 *   para una sola palabra y ahí lo urgente es la plata.
 * - En un listado cuyo trabajo es mostrar el estado de cada reserva, reemplazar
 *   colapsaría "Jugada" y "Ausente" en un mismo "Sin cobrar" y la columna de
 *   estado dejaría de decir el estado. Por eso el badge sigue diciendo el
 *   estado del turno y la plata va en una píldora al lado (`UNPAID_ALARM_BADGE`).
 *
 * El `accent` sí toma el tono de alarma cuando `unpaid`: MASTER §2.6 asigna el
 * COLOR al estado de la plata y el ícono+label a qué es la cosa. Una tira verde
 * al lado de una píldora roja rompería esa partición.
 *
 * Esto cierra el REQUIERE INPUT de T7 (el detalle mostraba el badge "Jugada"
 * arriba y "Saldo pendiente: $X" en Cobros más abajo, contradiciéndose en la
 * misma pantalla). Decisión del dueño, 2026-08-05: indicador aparte, el badge
 * de estado no cambia.
 */
export function bookingBadgeVisual(facts: SlotFacts): BookingBadgeVisual {
  const raw = slotStateKey(facts)
  const unpaid = raw === 'unpaid_alarm'
  // Con alarma, el estado real se recupera re-preguntando SIN los datos de
  // plata: `isUnpaidAlarm` degrada a false con `pending`/`totalPaid` nulos, así
  // que esto devuelve el key que `slotStateKey` habría dado sin alarma. Evita
  // duplicar la tabla de prioridades y deja intacta la función que pinta la
  // grilla.
  const base = unpaid ? slotStateKey({ ...facts, pending: null, totalPaid: null }) : raw
  const key: SlotStateKey = base === 'deposit_paid' ? 'confirmed' : base
  const meta = SLOT_STATES[key]
  return {
    key,
    label: meta.label,
    icon: meta.icon,
    tone: meta.tone,
    accent: unpaid ? TONE_ACCENT[UNPAID_ALARM_BADGE.tone] : TONE_ACCENT[meta.tone],
    unpaid,
  }
}

// ---------------------------------------------------------------------------
// Vista 3 — leyenda de la grilla
// ---------------------------------------------------------------------------

export type LegendItem = {
  key: SlotStateKey | 'free'
  label: string
  icon: LucideIcon
  swatch: string
  iconClass: string
}

const LEGEND_ORDER: SlotStateKey[] = [
  'pending_payment',
  'confirmed',
  'deposit_paid',
  'completed',
  'unpaid_alarm',
  'no_show',
  'fixed',
  'tournament',
  'block',
]

/**
 * La leyenda se DERIVA de la misma tabla que pinta las celdas, así que ya no
 * puede desincronizarse de ellas (era el caso hasta Fase 3: los tintes de la
 * leyenda usaban /15 y /25 donde las celdas usaban /10 y /20).
 */
export const GRID_LEGEND_ITEMS: readonly LegendItem[] = LEGEND_ORDER.filter(
  (key) => SLOT_STATES[key].inLegend,
).map((key) => {
  const meta = SLOT_STATES[key]
  const swatch = TONE_SWATCH[meta.tone]
  return {
    key,
    label: meta.label,
    icon: meta.icon,
    swatch: meta.striped ? `slot-blocked-stripes ${swatch}` : swatch,
    iconClass: TONE_TEXT[meta.tone],
  }
})
