import Link from 'next/link'
import '@/components/booking/reserva.css'
import '@/components/world/portal-app.css'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Lo que jugaste: partidos, complejos y racha de semanas seguidas con al menos un partido.
 * Solo presentación (los números salen de getPlayerActivity/computeStreakWeeks). Neutro a
 * propósito: sin puntajes, sin colores por logro, sin ranking.
 */
export default function ActivityStats({
  played,
  venues,
  streakWeeks,
}: {
  played: number
  venues: number
  streakWeeks: number
}) {
  const rows = [
    { label: 'Partidos jugados', value: String(played), unit: '' },
    { label: 'Complejos visitados', value: String(venues), unit: '' },
    {
      label: 'Racha',
      value: String(streakWeeks),
      unit: streakWeeks === 1 ? ' semana' : ' semanas',
    },
  ]

  return (
    <section id="actividad" aria-labelledby="actividad-titulo" className="scroll-mt-20 grid gap-3">
      <h2 id="actividad-titulo" className="rv-h2">
        Tu actividad
      </h2>
      <dl className="pa-stats">
        {rows.map(({ label, value, unit }) => (
          <div key={label} className="pa-stat glass-painted">
            <dt>{label}</dt>
            <dd>
              {value}
              {unit && <span className="text-base font-semibold text-portal-soft">{unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {played === 0 && (
        <div className="grid justify-items-start gap-3">
          <p className="rv-sub mt-0">Cuando juegues tu primer partido, lo vas a ver acá.</p>
          <Link
            href="/explorar"
            className={cn(buttonVariants({ variant: 'pill-link', size: 'pill-sm' }))}
          >
            Reservar una cancha
          </Link>
        </div>
      )}
    </section>
  )
}
