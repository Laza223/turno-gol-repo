import { DAY_KEYS, DAY_LABELS } from '@/shared/time/week-days'
import { effectiveDay, type ScheduleView } from '@/lib/schedule/schedule-view'
import { effectiveCloseMins } from '@/shared/time/operating-day'
import { timeToMins } from '@/lib/booking/pricing'

type Props = {
  view: ScheduleView
  closesNextDay: boolean
}

// Eje visible: 06:00 de hoy a 06:00 de mañana. Cubre las madrugadas de
// `closesNextDay` sin comprimir el resto de la semana a un pixel — el eje
// completo (24h) dejaría un cierre de 02:00 casi invisible.
const AXIS_START = 6 * 60
const AXIS_END = AXIS_START + 24 * 60
const AXIS_SPAN = AXIS_END - AXIS_START

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * Vista previa del paso 2: la semana en miniatura, la única representación
 * gráfica de un horario que existe en todo el producto (§A.1 del plan de
 * refactor). Una barra por día sobre el mismo eje — el hueco de un cierre
 * semanal, la madrugada de un cierre post-medianoche, se VE en vez de
 * deducirse de un par de `<input type="time">`.
 *
 * Geometría en minutos vía `effectiveCloseMins` (mismo cálculo que arma la
 * grilla real): un día `closesNextDay` con cierre 02:00 dibuja una barra que
 * cruza la medianoche, no una que "empieza antes de terminar". El texto de al
 * lado, en cambio, muestra el horario tal cual lo tipeó el dueño (`e.open`–
 * `e.close`) — es la hora de pared que reconoce, no el minuto continuo interno.
 */
export function WeekPreview({ view, closesNextDay }: Props) {
  return (
    <div className="card-premium rounded-2xl p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tu semana</p>
      <ul className="mt-3 space-y-2">
        {DAY_KEYS.map((day) => {
          const e = effectiveDay(view, day)

          if (e.closed) {
            return (
              <li key={day} className="flex items-center gap-3 text-xs">
                <span className="w-7 shrink-0 font-medium text-muted-foreground">
                  {DAY_LABELS[day]}
                </span>
                <span className="h-2 flex-1 rounded-full bg-muted" />
                <span className="w-16 shrink-0 text-right text-muted-foreground">Cerrado</span>
              </li>
            )
          }

          const openMins = timeToMins(e.open)
          const closeMins = effectiveCloseMins(e.open, e.close, closesNextDay)
          const leftPct = clamp(((openMins - AXIS_START) / AXIS_SPAN) * 100, 0, 100)
          const widthPct = clamp(((closeMins - openMins) / AXIS_SPAN) * 100, 0, 100 - leftPct)

          return (
            <li key={day} className="flex items-center gap-3 text-xs">
              <span className="w-7 shrink-0 font-medium text-foreground">{DAY_LABELS[day]}</span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="absolute inset-y-0 rounded-full bg-primary"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                />
              </span>
              <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                {e.open}–{e.close}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
