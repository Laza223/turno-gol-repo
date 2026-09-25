import {
  Ban,
  CheckCheck,
  CheckCircle2,
  Clock,
  CircleDollarSign,
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
 * el turno que ya se prestó y no se cobró tiene estado propio ("Por cobrar"),
 * que antes se pintaba igual que uno cobrado. Nació como alarma roja; desde el
 * refinamiento del 2026-09-24 va en ámbar (ver `pending_charge`).
 */

export type SlotStateKey =
  | 'tournament'
  | 'block'
  | 'pending_charge'
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
 * con un "Por cobrar" que no pueden justificar.
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
  /** Aparece en la leyenda de la grilla, en este orden. */
  inLegend?: boolean
}

const SLOT_STATES: Record<SlotStateKey, SlotStateMeta> = {
  pending_payment: {
    // Decisión del dueño 2026-09-10 (auditoría de coherencia, H018/H101): manda
    // MASTER §8.5 y el término es "Esperando seña" en TODO el panel. Deja sin
    // efecto la "Decisión v2 D1", que había desviado solo la grilla a "Pagando
    // ahora" sin anotar la excepción en ningún lado — y que dejó el mismo estado
    // con tres nombres distintos (grilla, filtro de Reservas, ficha del jugador).
    // La urgencia de la ventana de 6 minutos la comunica el contador de la celda,
    // no el rótulo. El jugador ve la misma palabra: por eso se entienden por teléfono.
    label: 'Esperando seña',
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
  // El turno se jugó y le falta plata. En el mostrador se cobra después del
  // partido (mediana: 29 min después de que termina,
  // docs/rediseno-panel/insumos.md), así que es el estado normal de la media
  // hora que sigue a cada turno: ámbar, el tono de lo pendiente, y no el rojo
  // de una alarma ni de una deuda (principio 3 de PRODUCT.md, DESIGN.md).
  // Hasta el 2026-09-24 fue "Sin cobrar" en rojo con un anillo que respiraba,
  // mientras Hoy ya decía "Por cobrar": dos superficies contradiciéndose.
  pending_charge: {
    label: 'Por cobrar',
    icon: CircleDollarSign,
    tone: 'warning',
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
 * Decisión de producto (2026-08-04, corregida 2026-09-09): "Por cobrar"
 * significa **plata en cero o incompleta Y cobrable**, no "algo salió mal".
 * - `completed` con saldo pendiente → por cobrar: se jugó y falta plata.
 * - `no_show` → NUNCA, cobrado o no. En un no-show la seña es lo único
 *   cobrable (regla de producto) y ya se cobró; lo que queda sin cobrar no es
 *   deuda (veto "No-show NO es deuda", CLAUDE.md) y no hay ningún botón para
 *   accionarlo. Marcar algo que no se puede cobrar solo entrena al staff a
 *   ignorar la marca.
 *
 * Sin datos de plata (`pending`/`totalPaid` ausentes) NO se dispara: una marca
 * falsa entrena al staff a ignorarlas.
 */
function isPendingCharge(facts: SlotFacts): boolean {
  return facts.status === 'completed' && typeof facts.pending === 'number' && facts.pending > 0
}

/**
 * El estado visual del turno. NO es 1:1 con `booking_status`: cruza estado,
 * tipo, seña y plata cobrada.
 *
 * Orden de prioridad (el primero que matchea gana):
 * torneo → bloqueo → **por cobrar** → ausente → jugada → esperando seña →
 * señada → abonado → cancelada/expirada → confirmada.
 *
 * "Por cobrar" va antes que `completed` porque justamente lo refina: abajo de
 * `completed` no se dispararía nunca. Ya NO refina a `no_show` (ver
 * `isPendingCharge`, 2026-09-09): un no-show nunca queda por cobrar, así que el
 * orden entre los dos dejó de importar en la práctica — se deja igual para no
 * reordenar sin necesidad. Torneo y bloqueo van primero porque no son la
 * reserva de un jugador y ninguna rama de plata los describe bien (ambos tienen
 * `price_snapshot = 0`, así que tampoco pueden quedar por cobrar).
 */
export function slotStateKey(facts: SlotFacts): SlotStateKey {
  if (facts.type === 'tournament') return 'tournament'
  if (facts.type === 'block') return 'block'
  if (isPendingCharge(facts)) return 'pending_charge'
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
  /**
   * Turno jugado al que le falta plata. La celda no se atenúa aunque sea
   * pasado: lo es por definición, y apagarla escondería lo que falta cobrar.
   */
  pendingCharge: boolean
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
    pendingCharge: key === 'pending_charge',
  }
}

/**
 * Saldo pendiente a mostrar como indicador SECUNDARIO en la celda, en centavos.
 * Devuelve null cuando no hay nada que decir: sin dato de plata (Realtime crudo,
 * fixtures viejas), saldo cero (cobrado, o bloqueo/torneo con price_snapshot 0),
 * `pending_payment` (esa línea ya la ocupa el contador del hold) o `no_show`
 * (veto "No-show NO es deuda": en un no-show lo que queda sin cobrar no es
 * cobrable, así que no hay "falta $X" que mostrar — mismo motivo que lo deja
 * afuera de `isPendingCharge`).
 *
 * Es un NÚMERO, no un estado: la grilla sigue teniendo 9 estados y 9 colores.
 */
export function slotPendingCents(facts: SlotFacts): number | null {
  if (typeof facts.pending !== 'number' || facts.pending <= 0) return null
  const key = slotStateKey(facts)
  if (key === 'pending_payment' || key === 'no_show') return null
  return facts.pending
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
   * un flag para pintar la píldora "Por cobrar" APARTE, al lado del badge.
   */
  unpaid: boolean
}

/**
 * "Por cobrar" fuera de la celda: la píldora del listado y del detalle de
 * Reservas, la fila del tablero de Hoy y el chip "Por cobrar hoy" de la Grilla.
 * Sale de la MISMA fila de `SLOT_STATES` que pinta la celda, así que ninguna
 * superficie puede decir otra cosa de la misma situación.
 */
export const PENDING_CHARGE_BADGE = {
  label: SLOT_STATES.pending_charge.label,
  icon: SLOT_STATES.pending_charge.icon,
  tone: SLOT_STATES.pending_charge.tone,
} as const

/**
 * "Señada" y "Confirmada" se distinguen en TODAS las superficies desde el
 * 2026-09-12. Antes el listado las colapsaba en "Confirmada" a propósito y la
 * grilla no, y esa divergencia sobrevivió mientras el listado era el único
 * lugar donde se leía el estado sin ver el color. El rediseño de Hoy la volvió
 * insostenible: ahí el color dice el estado de la plata, y colapsar las dos
 * pone el mismo badge sobre "ya tengo parte de la plata" y sobre "cobro todo
 * cuando llegue" justo en la pantalla que se abre para saber a quién hay que
 * cobrarle. Decisión del dueño: gana el criterio de la grilla, en las tres.
 *
 * "Por cobrar" viaja al listado como **flag** (`unpaid`), NUNCA como label. La
 * diferencia es el contrato entero de esta función:
 *
 * - En la grilla "Por cobrar" REEMPLAZA al label, porque una celda tiene lugar
 *   para una sola palabra y ahí lo que importa es la plata.
 * - En un listado cuyo trabajo es mostrar el estado de cada reserva, reemplazar
 *   colapsaría "Jugada" y "Ausente" en un mismo "Por cobrar" y la columna de
 *   estado dejaría de decir el estado. Por eso el badge sigue diciendo el
 *   estado del turno y la plata va en una píldora al lado (`PENDING_CHARGE_BADGE`).
 *
 * El `accent` sí toma el tono de "Por cobrar" cuando `unpaid`: MASTER §2.6
 * asigna el COLOR al estado de la plata y el ícono+label a qué es la cosa. Una
 * tira verde al lado de una píldora ámbar rompería esa partición.
 *
 * Esto cierra el REQUIERE INPUT de T7 (el detalle mostraba el badge "Jugada"
 * arriba y "Saldo pendiente: $X" en Cobros más abajo, contradiciéndose en la
 * misma pantalla). Decisión del dueño, 2026-08-05: indicador aparte, el badge
 * de estado no cambia.
 *
 * Lo único que sigue divergiendo entre grilla y listado es eso: "Por cobrar".
 * La grilla lo pone en el label porque una celda tiene lugar para una palabra
 * sola; el listado lo pone al lado.
 */
export function bookingBadgeVisual(facts: SlotFacts): BookingBadgeVisual {
  const raw = slotStateKey(facts)
  const unpaid = raw === 'pending_charge'
  // Por cobrar, el estado real se recupera re-preguntando SIN los datos de
  // plata: `isPendingCharge` degrada a false con `pending`/`totalPaid` nulos,
  // así que esto devuelve el key que `slotStateKey` habría dado sin la plata. Evita
  // duplicar la tabla de prioridades y deja intacta la función que pinta la
  // grilla.
  const key = unpaid ? slotStateKey({ ...facts, pending: null, totalPaid: null }) : raw
  const meta = SLOT_STATES[key]
  return {
    key,
    label: meta.label,
    icon: meta.icon,
    tone: meta.tone,
    accent: unpaid ? TONE_ACCENT[PENDING_CHARGE_BADGE.tone] : TONE_ACCENT[meta.tone],
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
  'pending_charge',
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
