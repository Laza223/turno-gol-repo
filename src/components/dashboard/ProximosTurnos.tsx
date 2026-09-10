import Link from 'next/link'
import { CalendarCheck, CalendarOff, LandPlot } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { bookingBadgeVisual } from '@/lib/booking/slot-visual'
import { TONE_BADGE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { UpcomingCourt } from '@/modules/home/home.types'

/**
 * "Próximos turnos" — el corazón operativo de Hoy desde el rediseño del
 * 2026-09-10 (auditoría de coherencia, H010).
 *
 * Reemplaza a las tarjetas "Cobrado hoy" y "Deudas", que eran el MISMO
 * componente con el MISMO dato que ya vive en Caja: la pantalla dejó de
 * repetir plata que se lee un click más allá y pasó a contestar la pregunta
 * que no contestaba nadie — qué falta jugar, cancha por cancha.
 *
 * Una fila por cancha ONLINE, en el mismo orden en que la grilla dibuja las
 * columnas (`courts.created_at`), para que las dos pantallas se lean igual.
 * El badge sale de `bookingBadgeVisual`, la misma tabla que pinta la grilla y
 * el listado: acá no puede aparecer un quinto nombre para un estado que ya
 * tiene el suyo.
 */
export function ProximosTurnos({
  courts,
  occupancy,
  dayIsClosed,
}: {
  courts: UpcomingCourt[]
  occupancy: { occupied: number; available: number; blocked: number; pct: number }
  /** El día no tiene horarios (feriado, o el día marcado cerrado). */
  dayIsClosed: boolean
}) {
  const total = courts.reduce((n, c) => n + c.turns.length, 0)

  return (
    <section className="card-premium rounded-2xl">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold text-foreground">Próximos turnos</h2>
        <p className="text-sm text-muted-foreground">{occupancyLabel(occupancy, dayIsClosed)}</p>
      </header>

      {dayIsClosed ? (
        <EmptyState
          icon={CalendarOff}
          title="Hoy el complejo está cerrado."
          description="No hay horarios cargados para este día."
          className="rounded-t-none border-0 py-10"
        />
      ) : courts.length === 0 ? (
        <EmptyState
          icon={LandPlot}
          title="No hay ninguna cancha en servicio."
          description="Mientras estén todas pausadas no se puede reservar nada."
          action={
            <Link href="/canchas" className="text-sm font-medium text-primary hover:underline">
              Ir a Canchas
            </Link>
          }
          className="rounded-t-none border-0 py-10"
        />
      ) : total === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No queda nada por jugar hoy."
          description="Los turnos que quedaban ya se jugaron."
          className="rounded-t-none border-0 py-10"
        />
      ) : (
        <ul className="divide-y divide-border">
          {courts.map((court) => (
            <li key={court.courtId} className="px-4 py-3 sm:px-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {court.courtName}
                </h3>
                {court.turns.length > 0 && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {court.turns.length === 1 ? '1 turno' : `${court.turns.length} turnos`}
                  </span>
                )}
              </div>

              {court.turns.length === 0 ? (
                // Decir "libre" y no dejar la cancha en blanco: una fila vacía
                // se lee como "no cargó", y acá lo vacío es justamente el dato
                // que el dueño usa para ofrecerle el horario a alguien.
                <p className="mt-1 text-sm text-muted-foreground">Libre el resto del día.</p>
              ) : (
                <ol className="mt-2 space-y-1.5">
                  {court.turns.map((turn) => {
                    const badge = bookingBadgeVisual({
                      status: turn.status,
                      type: turn.type,
                      depositStatus: turn.depositStatus,
                    })
                    return (
                      <li key={turn.bookingId}>
                        <Link
                          href={`/reservas/${turn.bookingId}`}
                          className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/50"
                        >
                          <span
                            className={cn('h-8 w-1 shrink-0 rounded-full', badge.accent)}
                            aria-hidden="true"
                          />
                          {/* En una sola línea a 375px el nombre se comía a sí
                              mismo: hora, "en 35 min" y un badge como
                              "Esperando seña" no dejan ancho, y `truncate` lo
                              colapsaba hasta desaparecer. En mobile baja a su
                              propio renglón; de sm para arriba la fila sigue
                              siendo una sola. */}
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                            {/* `whitespace-nowrap` y no solo `shrink-0`: en la
                                columna de mobile el rango se parte al medio
                                ("18:00-" / "19:00") y deja de leerse como una
                                hora. */}
                            <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums text-foreground">
                              {turn.timeLabel}
                            </span>
                            <span className="min-w-0 truncate text-sm text-muted-foreground">
                              {turn.contactName}
                            </span>
                          </span>
                          {turn.relativeLabel && (
                            <span className="shrink-0 text-xs font-medium text-foreground">
                              {turn.relativeLabel}
                            </span>
                          )}
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                              TONE_BADGE[badge.tone],
                            )}
                          >
                            {badge.label}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * El resumen de ocupación del día, que antes era una tarjeta suelta ("Turnos de
 * hoy"). Vive en el encabezado de este bloque porque el número solo significa
 * algo al lado de las canchas que lo produjeron.
 *
 * Con 0 canchas online (o todo bloqueado) el denominador da 0 pero el numerador
 * puede seguir contando turnos reales: ahí se muestra solo el numerador, para
 * no escribir "N de 0" ni un "0% de ocupación" que engaña.
 */
function occupancyLabel(
  occupancy: { occupied: number; available: number; blocked: number; pct: number },
  dayIsClosed: boolean,
): string {
  if (dayIsClosed) return 'Sin horarios para hoy'
  if (occupancy.available === 0) return `${occupancy.occupied} turnos · sin horarios disponibles`
  const blocked = occupancy.blocked > 0 ? ` · ${occupancy.blocked} bloqueados` : ''
  return `${occupancy.occupied} de ${occupancy.available} · ${occupancy.pct}% de ocupación${blocked}`
}
