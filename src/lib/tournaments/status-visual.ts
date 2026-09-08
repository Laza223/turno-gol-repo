import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  Clock,
  FileEdit,
  Goal,
  LogOut,
  PlayCircle,
  RectangleVertical,
  ShieldOff,
  TrendingUp,
  UserPlus,
  UserX,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import type { StatusTone } from '@/lib/status-tone'
import type {
  TournamentEventType,
  TournamentMatchStatus,
  TournamentStatus,
  TournamentTeamStatus,
} from '@/modules/tournaments/tournament.types'

/**
 * Fuente ÚNICA de "qué estado muestra esto" en torneos — admin y portal
 * público.
 *
 * Antes esto eran seis `switch` en `(admin)/torneos/torneos-lib.ts` que
 * reimplementaban a mano la receta de `status-tone.ts`, más cuatro chips
 * escritos directo en el JSX de las tablas de posiciones. Habían divergido en
 * las dos cosas que la tabla existe para fijar:
 *
 * - **Contraste**: cuatro estados usaban `bg-muted text-muted-foreground`, la
 *   receta que `status-tone.ts:7-10` documenta como 4.21:1 y FALLA AA. Era
 *   justo el bug que la Fase 3 arregló en el resto del admin.
 * - **Ícono**: ninguno tenía. El comentario que encabezaba esos `switch` decía
 *   respetar MASTER §1.4 ("color + texto siempre, nunca color solo"), pero el
 *   sistema pide color + ÍCONO + texto (§6.5): con ~8% de daltonismo, la forma
 *   es lo que separa "En curso" de "Cancelado" cuando el verde y el rojo se
 *   ven parecidos.
 *
 * Vive en `src/lib/` y no en la ruta del admin porque el portal público lo
 * consume igual; hasta ahora `(public)/[slug]/torneos/*` importaba de
 * `(admin)/torneos/`, una flecha que este módulo borra.
 *
 * Los labels viven acá y no en `torneos-lib.ts` por la misma razón: son el
 * texto del estado, y el badge no puede ser la única superficie que lo diga
 * (el fixture también lo escribe como texto plano, y los toasts lo usan en
 * minúscula). Una sola tabla, tres consumidores.
 */

/**
 * Estructuralmente es el `StatusBadgeVisual` de `@/components/ui/status-badge`,
 * declarado acá para que `src/lib` no dependa de `src/components` — mismo
 * criterio que `BookingBadgeVisual` en `slot-visual.ts`. `<StatusBadge>` lo
 * acepta por tipado estructural.
 */
export type TournamentBadgeVisual = {
  icon: LucideIcon
  label: string
  tone: StatusTone
}

// ── Torneo ──────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: 'Borrador',
  registration: 'Inscripción abierta',
  in_progress: 'En curso',
  finished: 'Terminado',
  canceled: 'Cancelado',
}

export const TOURNAMENT_STATUS_VISUAL: Record<TournamentStatus, TournamentBadgeVisual> = {
  draft: { label: STATUS_LABELS.draft, icon: FileEdit, tone: 'neutral' },
  registration: { label: STATUS_LABELS.registration, icon: UserPlus, tone: 'info' },
  in_progress: { label: STATUS_LABELS.in_progress, icon: PlayCircle, tone: 'success' },
  finished: { label: STATUS_LABELS.finished, icon: CheckCheck, tone: 'neutral' },
  canceled: { label: STATUS_LABELS.canceled, icon: XCircle, tone: 'destructive' },
}

// ── Equipo ──────────────────────────────────────────────────────────

export const TEAM_STATUS_LABELS: Record<TournamentTeamStatus, string> = {
  registered: 'Inscripto',
  confirmed: 'Confirmado',
  withdrawn: 'Se bajó',
  disqualified: 'Descalificado',
}

export const TEAM_STATUS_VISUAL: Record<TournamentTeamStatus, TournamentBadgeVisual> = {
  registered: { label: TEAM_STATUS_LABELS.registered, icon: UserPlus, tone: 'neutral' },
  confirmed: { label: TEAM_STATUS_LABELS.confirmed, icon: CheckCircle2, tone: 'success' },
  withdrawn: { label: TEAM_STATUS_LABELS.withdrawn, icon: LogOut, tone: 'warning' },
  disqualified: { label: TEAM_STATUS_LABELS.disqualified, icon: Ban, tone: 'destructive' },
}

// ── Partido ─────────────────────────────────────────────────────────

export const MATCH_STATUS_LABELS: Record<TournamentMatchStatus, string> = {
  scheduled: 'Programado',
  played: 'Jugado',
  walkover: 'No se presentó',
  postponed: 'Postergado',
  canceled: 'Cancelado',
}

export const MATCH_STATUS_VISUAL: Record<TournamentMatchStatus, TournamentBadgeVisual> = {
  scheduled: { label: MATCH_STATUS_LABELS.scheduled, icon: Clock, tone: 'neutral' },
  played: { label: MATCH_STATUS_LABELS.played, icon: CheckCheck, tone: 'success' },
  // `UserX` es el mismo ícono que la ausencia de un turno (`slot-visual.ts`):
  // un walkover es exactamente eso, alguien que no se presentó.
  walkover: { label: MATCH_STATUS_LABELS.walkover, icon: UserX, tone: 'warning' },
  postponed: { label: MATCH_STATUS_LABELS.postponed, icon: CalendarClock, tone: 'info' },
  canceled: { label: MATCH_STATUS_LABELS.canceled, icon: XCircle, tone: 'destructive' },
}

// ── Eventos del acta (migr. 065) ────────────────────────────────────

export const EVENT_TYPE_LABELS: Record<TournamentEventType, string> = {
  goal: 'Gol',
  own_goal: 'Gol en contra',
  yellow_card: 'Amarilla',
  red_card: 'Roja',
}

export const EVENT_TYPE_VISUAL: Record<TournamentEventType, TournamentBadgeVisual> = {
  goal: { label: EVENT_TYPE_LABELS.goal, icon: Goal, tone: 'success' },
  own_goal: { label: EVENT_TYPE_LABELS.own_goal, icon: ShieldOff, tone: 'neutral' },
  yellow_card: { label: EVENT_TYPE_LABELS.yellow_card, icon: RectangleVertical, tone: 'warning' },
  // `Ban` y no otra tarjeta: la roja se lee por lo que hace (deja al jugador
  // afuera), que es lo mismo que comunica el ícono de bloqueo del resto del
  // sistema. El color ya lo separa de la amarilla; la forma no debería
  // depender del color para distinguirlas (MASTER §1.4).
  red_card: { label: EVENT_TYPE_LABELS.red_card, icon: Ban, tone: 'destructive' },
}

// ── Marcas de la tabla de posiciones ────────────────────────────────

export const QUALIFICATION_VISUAL: TournamentBadgeVisual = {
  label: 'Clasifica',
  icon: TrendingUp,
  tone: 'success',
}

/**
 * El label real lo pone el consumidor ("Debe 2 fechas"): el número de fechas
 * pendientes es un dato de la fila, no del estado. El tono y el ícono sí son
 * del sistema.
 */
export const SUSPENSION_VISUAL: TournamentBadgeVisual = {
  label: 'Suspendido',
  icon: AlertTriangle,
  tone: 'warning',
}
