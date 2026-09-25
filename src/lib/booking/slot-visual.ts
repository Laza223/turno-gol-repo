import {
  Ban,
  CheckCheck,
  CheckCircle2,
  Clock,
  CircleDollarSign,
  Gift,
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
 * el turno que ya se prestó y no se cobró tiene estado propio ("No cobrado"),
 * que antes se pintaba igual que uno cobrado. Nació como alarma roja, pasó a
 * ámbar el 2026-09-24 y volvió a rojo el 2026-09-25 — decisión del dueño: el
 * complejo piloto acumuló cientos de miles de pesos en turnos sin cobrar y el
 * ámbar no transmitía urgencia (ver `pending_charge`).
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
 * con un "No cobrado" que no pueden justificar.
 */
export type SlotFacts = {
  status: BookingStatus | string
  type: BookingType | string
  depositStatus?: DepositStatus | string | null
  /** Saldo pendiente en centavos (price_snapshot − cobrado). */
  pending?: number | null
  /** Total cobrado en centavos: seña contada + cobros de mostrador. */
  totalPaid?: number | null
  /**
   * ¿Ya pasó `ends_at` (el instante físico de fin del turno)? Solo cambia algo
   * para `confirmed`: el auto-complete tarda ~30 min en pasarlo a `completed`,
   * así que sin este dato un turno recién terminado seguía leyéndose
   * "Confirmada" con plata pendiente en vez de "No cobrado". Opcional, y
   * default `undefined` (≠ `true`) a propósito: sin pasarlo, el comportamiento
   * es IDÉNTICO al de antes de esta bandera — el portal del jugador
   * (`mis-reservas/status-visual.ts`) no lo pasa y no tiene por qué cambiar.
   */
  ended?: boolean
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
  // hora que sigue a cada turno. Pasó por tres colores: nació rojo con un
  // anillo que respiraba, el refinamiento del 2026-09-24 lo bajó a ámbar
  // ("por cobrar, no alarma") y el dueño lo volvió a rojo el 2026-09-25: el
  // complejo piloto acumuló cientos de miles de pesos sin cobrar y el ámbar no
  // transmitía urgencia. La palabra es "No cobrado" — nunca "deuda" (el veto
  // "No-show NO es deuda" sigue intacto: esto es plata de un turno cobrable).
  pending_charge: {
    label: 'No cobrado',
    icon: CircleDollarSign,
    tone: 'destructive',
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
 * Decisión de producto (2026-08-04, corregida 2026-09-09): "No cobrado"
 * significa **plata en cero o incompleta Y cobrable**, no "algo salió mal".
 * - `completed` con saldo pendiente → no cobrado: se jugó y falta plata.
 * - `confirmed` con saldo pendiente Y `ended` → también: el auto-complete
 *   tarda ~30 min en pasarlo a `completed`, y en esa ventana el turno YA se
 *   jugó (el instante físico `ends_at` ya pasó) aunque el status todavía diga
 *   `confirmed`. Sin `ended` (undefined) esta rama nunca dispara — así el
 *   portal del jugador, que no lo pasa, queda exactamente igual que antes.
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
  if (typeof facts.pending !== 'number' || facts.pending <= 0) return false
  return facts.status === 'completed' || (facts.status === 'confirmed' && facts.ended === true)
}

/**
 * El estado visual del turno. NO es 1:1 con `booking_status`: cruza estado,
 * tipo, seña y plata cobrada.
 *
 * Orden de prioridad (el primero que matchea gana):
 * torneo → bloqueo → **no cobrado** → ausente → jugada → esperando seña →
 * señada → abonado → cancelada/expirada → confirmada.
 *
 * "No cobrado" va antes que `completed` porque justamente lo refina: abajo de
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
   * un flag para pintar la píldora "No cobrado" APARTE, al lado del badge.
   */
  unpaid: boolean
}

/**
 * "No cobrado" fuera de la celda: la píldora del listado y del detalle de
 * Reservas, la fila del tablero de Hoy y el chip "N sin cobrar" de la
 * Grilla. Sale de la MISMA fila de `SLOT_STATES` que pinta la celda, así que
 * ninguna superficie puede decir otra cosa de la misma situación.
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
 * "No cobrado" viaja al listado como **flag** (`unpaid`), NUNCA como label. La
 * diferencia es el contrato entero de esta función:
 *
 * - En la grilla "No cobrado" REEMPLAZA al label, porque una celda tiene lugar
 *   para una sola palabra y ahí lo que importa es la plata.
 * - En un listado cuyo trabajo es mostrar el estado de cada reserva, reemplazar
 *   colapsaría "Jugada" y "Ausente" en un mismo "No cobrado" y la columna de
 *   estado dejaría de decir el estado. Por eso el badge sigue diciendo el
 *   estado del turno y la plata va en una píldora al lado (`PENDING_CHARGE_BADGE`).
 *
 * El `accent` sí toma el tono de "No cobrado" cuando `unpaid`: MASTER §2.6
 * asigna el COLOR al estado de la plata y el ícono+label a qué es la cosa. Una
 * tira verde al lado de una píldora roja rompería esa partición.
 *
 * Esto cierra el REQUIERE INPUT de T7 (el detalle mostraba el badge "Jugada"
 * arriba y "Saldo pendiente: $X" en Cobros más abajo, contradiciéndose en la
 * misma pantalla). Decisión del dueño, 2026-08-05: indicador aparte, el badge
 * de estado no cambia.
 *
 * Lo único que sigue divergiendo entre grilla y listado es eso: "No cobrado".
 * La grilla lo pone en el label porque una celda tiene lugar para una palabra
 * sola; el listado lo pone al lado.
 */
export function bookingBadgeVisual(facts: SlotFacts): BookingBadgeVisual {
  const raw = slotStateKey(facts)
  const unpaid = raw === 'pending_charge'
  // No cobrado: el estado real se recupera re-preguntando SIN los datos de
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

// ---------------------------------------------------------------------------
// Vista 4 — celda de la Grilla, variante "Entra entera" (decisión del dueño,
// 2026-09-25): el color deja de ser 1:1 con `booking_status` y pasa a ser
// SOLO de la plata — rojo lo jugado y no cobrado, verde lo pagado entero, el
// resto sin color. Reemplaza a `gridSlotVisual` ÚNICAMENTE en la celda de la
// Grilla (BookingCard): `gridSlotVisual`/`SLOT_STATES` siguen intactos porque
// los sigue usando el modal de cobro de Hoy y el listado de /reservas.
// ---------------------------------------------------------------------------

type GridMoneyStateKey =
  | 'tournament'
  | 'block'
  | 'pending_payment'
  | 'no_show'
  | 'free_event'
  | 'no_data'
  | 'paid'
  | 'pending_charge'
  | 'fixed'
  | 'live'
  | 'upcoming'

export type GridMoneyFacts = SlotFacts & {
  /** Precio total del turno en centavos: 0 en escuelitas/torneos internos → "Sin cargo". */
  priceSnapshot: number
  /** ¿Ya empezó este turno (`isSlotPast` de su propio horario)? Decide "Se juega" vs vacío en lo que no terminó. */
  started: boolean
}

export type GridMoneyVisual = {
  key: GridMoneyStateKey
  label: string
  icon: LucideIcon | null
  tone: StatusTone
  /** Rayado diagonal: bloqueo y torneo, igual que en `gridSlotVisual`. */
  striped: boolean
  /** Plata a mostrar en la celda, en centavos. `null` = nada que decir. */
  amountCents: number | null
  /** Hubo un pago parcial: el monto largo es "Falta $X", no el saldo pelado. */
  partial: boolean
}

/**
 * El color de la celda de la Grilla (variante "Entra entera"): el primero que
 * matchea gana — torneo → bloqueo → esperando seña → ausente → sin cargo
 * (precio 0) → sin dato de plata (Realtime crudo) → pagado → no cobrado → el
 * resto, sin color.
 *
 * "No cobrado" usa la MISMA regla que `gridSlotVisual` (`slotStateKey` con
 * `ended`), así que las dos celdas —esta y la del modal de cobro de Hoy—
 * nunca pueden decir cosas distintas del mismo turno.
 */
export function gridMoneyVisual(facts: GridMoneyFacts): GridMoneyVisual {
  if (facts.type === 'tournament') {
    return {
      key: 'tournament',
      label: 'Torneo',
      icon: Trophy,
      tone: 'warning',
      striped: true,
      amountCents: null,
      partial: false,
    }
  }
  if (facts.type === 'block') {
    return {
      key: 'block',
      label: 'Bloqueado',
      icon: Ban,
      tone: 'neutral',
      striped: true,
      amountCents: null,
      partial: false,
    }
  }
  if (facts.status === 'pending_payment') {
    return {
      key: 'pending_payment',
      label: 'Esperando seña',
      icon: Clock,
      tone: 'warning',
      striped: false,
      amountCents: null,
      partial: false,
    }
  }
  if (facts.status === 'no_show') {
    return {
      key: 'no_show',
      label: 'Ausente',
      icon: UserX,
      tone: 'neutral',
      striped: false,
      amountCents: null,
      partial: false,
    }
  }
  if (facts.priceSnapshot === 0) {
    return {
      key: 'free_event',
      label: 'Sin cargo',
      icon: Gift,
      tone: 'neutral',
      striped: false,
      amountCents: null,
      partial: false,
    }
  }
  if (typeof facts.pending !== 'number') {
    // Realtime crudo / fixtures viejas: sin dato de plata no se inventa nada.
    return {
      key: 'no_data',
      label: '',
      icon: null,
      tone: 'neutral',
      striped: false,
      amountCents: null,
      partial: false,
    }
  }
  if (facts.pending === 0) {
    return {
      key: 'paid',
      label: 'Pagado',
      icon: CheckCheck,
      tone: 'success',
      striped: false,
      amountCents: null,
      partial: false,
    }
  }
  if (slotStateKey(facts) === 'pending_charge') {
    return {
      key: 'pending_charge',
      label: 'No cobrado',
      icon: CircleDollarSign,
      tone: 'destructive',
      striped: false,
      amountCents: facts.pending,
      partial: (facts.totalPaid ?? 0) > 0,
    }
  }
  return {
    key: facts.type === 'fixed' ? 'fixed' : facts.started ? 'live' : 'upcoming',
    label: facts.type === 'fixed' ? 'Turno fijo' : facts.started ? 'Se juega' : '',
    icon: facts.type === 'fixed' ? Repeat : null,
    tone: 'neutral',
    striped: false,
    amountCents: facts.pending,
    partial: (facts.totalPaid ?? 0) > 0,
  }
}

/** Item de la leyenda derivada de {@link gridMoneyVisual} (distinta de {@link LegendItem}: sus keys no son `SlotStateKey`). */
export type GridMoneyLegendItem = {
  key: GridMoneyStateKey | 'free'
  label: string
  /** `null` cuando la celda real no pinta ícono (el turno por jugar): la leyenda no enseña lo que no se ve. */
  icon: LucideIcon | null
  swatch: string
  iconClass: string
}

const GRID_MONEY_LEGEND: readonly {
  key: GridMoneyStateKey
  label: string
  icon: LucideIcon | null
  tone: StatusTone
  striped?: boolean
}[] = [
  { key: 'pending_charge', label: 'No cobrado', icon: CircleDollarSign, tone: 'destructive' },
  { key: 'paid', label: 'Pagado', icon: CheckCheck, tone: 'success' },
  { key: 'pending_payment', label: 'Esperando seña', icon: Clock, tone: 'warning' },
  { key: 'upcoming', label: 'Por jugar', icon: null, tone: 'neutral' },
  { key: 'block', label: 'Bloqueado', icon: Ban, tone: 'neutral', striped: true },
]

/**
 * Leyenda de la celda "Entra entera": los 5 estados que el dueño eligió que
 * se expliquen (no está "Sin cargo", "Ausente" ni "Torneo" — la celda los
 * sigue pintando, pero no forman parte del mini-tutorial).
 */
export const GRID_MONEY_LEGEND_ITEMS: readonly GridMoneyLegendItem[] = GRID_MONEY_LEGEND.map(
  (item) => {
    const swatch = TONE_SWATCH[item.tone]
    return {
      key: item.key,
      label: item.label,
      icon: item.icon,
      swatch: item.striped ? `slot-blocked-stripes ${swatch}` : swatch,
      iconClass: TONE_TEXT[item.tone],
    }
  },
)
