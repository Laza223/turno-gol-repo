import { CalendarClock, MapPin } from 'lucide-react'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'

type Props = {
  name?: string
  place?: string
  /** Cantidad por formato (`{ "5": 2 }`). */
  courts?: Record<string, number>
  hours?: { openHour: number; closeHour: number }
  /** Precio del turno más barato cargado, en centavos. */
  fromPrice?: number
}

const hh = (hour: number) => `${String(hour).padStart(2, '0')}:00`

/**
 * "Tu complejo se va armando": una ficha chica arriba de la pregunta que se completa con
 * cada respuesta. Lo que falta se ve como silueta; cada dato nuevo entra con un pulso
 * (`.signup-pop`, keyed por su valor: cambiar el dato lo vuelve a disparar).
 */
export function ComplexBuildCard({ name, place, courts, hours, fromPrice }: Props) {
  const courtChips = Object.entries(courts ?? {})
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([format, n]) => `${n} × F${format}`)

  return (
    <section
      aria-label="Tu complejo hasta ahora"
      className="signup-glass relative overflow-hidden rounded-2xl px-4 py-3.5"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-300">
        Tu complejo
      </p>
      {name ? (
        <p
          key={name}
          className="signup-pop mt-0.5 truncate font-display text-xl font-black italic leading-tight text-white"
        >
          {name}
        </p>
      ) : (
        <span aria-hidden className="mt-1.5 block h-5 w-44 rounded-md bg-white/8" />
      )}
      {place ? (
        <p
          key={place}
          className="signup-pop mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground"
        >
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{place}</span>
        </p>
      ) : (
        <span aria-hidden className="mt-2 block h-3.5 w-32 rounded-md bg-white/6" />
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {courtChips.length > 0 ? (
          courtChips.map((chip) => (
            <Chip key={chip} lit>
              {chip}
            </Chip>
          ))
        ) : (
          <Ghost>Canchas</Ghost>
        )}
        {hours ? (
          <Chip key={`${hours.openHour}-${hours.closeHour}`}>
            <CalendarClock className="size-3.5" aria-hidden />
            {hh(hours.openHour)} a {hh(hours.closeHour)}
          </Chip>
        ) : (
          <Ghost>Horario</Ghost>
        )}
        {fromPrice ? (
          <Chip key={fromPrice}>Turno {formatArs(fromPrice)}</Chip>
        ) : (
          <Ghost>Precio</Ghost>
        )}
      </div>
    </section>
  )
}

function Chip({ children, lit }: { children: React.ReactNode; lit?: boolean }) {
  return (
    <span
      className={cn(
        'signup-pop inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold tabular-nums',
        lit ? 'signup-lit text-emerald-200' : 'border-white/12 bg-white/5 text-slate-200',
      )}
    >
      {children}
    </span>
  )
}

function Ghost({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-full border border-dashed border-white/15 px-2.5 text-xs text-slate-400">
      {children}
    </span>
  )
}
