import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
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
    { label: 'Partidos jugados', value: String(played) },
    { label: 'Complejos visitados', value: String(venues) },
    { label: 'Racha', value: `${streakWeeks} ${streakWeeks === 1 ? 'semana' : 'semanas'}` },
  ]

  return (
    <section id="actividad" aria-labelledby="actividad-titulo" className="scroll-mt-20">
      <h2 id="actividad-titulo" className={PORTAL_SECTION_TITLE}>
        Tu actividad
      </h2>
      <dl className="mt-2 divide-y divide-border border-y border-border">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex min-h-11 items-center justify-between gap-4 py-2">
            <dt className="text-base text-muted-foreground">{label}</dt>
            <dd className="text-base font-semibold tabular-nums text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {played === 0 && (
        <div className="mt-3">
          <p className="text-base text-muted-foreground">
            Cuando juegues tu primer partido, lo vas a ver acá.
          </p>
          <Link
            href="/explorar"
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'mt-4 h-auto min-h-11 md:h-auto shadow-none hover:translate-y-0 hover:shadow-none active:scale-100 focus-visible:ring-offset-background',
            )}
          >
            Reservar una cancha
          </Link>
        </div>
      )}
    </section>
  )
}
