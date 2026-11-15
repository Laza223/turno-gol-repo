import Link from 'next/link'
import { formatLabel } from '@/components/public/courtFacets'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { matchTypeLabel, whenLabel } from '@/modules/rival/rival-display'
import type { RivalBoardItem } from '@/modules/rival/rival.types'
import './ficha-rest.css'

const TAG =
  'inline-flex h-7 items-center rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap'

/**
 * "Partidos abiertos": los partidos de RIVAL publicados en este complejo (portal de vidrio F4,
 * `.match` de `complejo.html`). Presentacional: la página decide si el flag `rival` está prendido y
 * pasa lo que devuelve `listBoard({ tenantId })`; con cero partidos no hay sección. Cada tarjeta
 * lleva a `/rival/partido/<id>`. Los textos son los del tablón (`BoardView`): el tipo y la hora
 * salen de `rival-display`, y el cupo es "Ya son N de M". Sin personas, como el tablón.
 *
 * Server Component, sin cookies ni headers: la ficha es ISR.
 */
export default function OpenMatches({
  items,
  tenantId,
}: {
  items: RivalBoardItem[]
  tenantId: string
}) {
  if (items.length === 0) return null
  const now = new Date()

  return (
    <section aria-labelledby="partidos-abiertos" className="fr-blk fr-reveal">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="partidos-abiertos" className="fr-h2">
          Partidos abiertos
        </h2>
        <Link
          href={`/rival?complejo=${tenantId}`}
          className={cn(buttonVariants({ variant: 'pill-link', size: 'pill-sm' }))}
        >
          Ver el tablón
        </Link>
      </div>

      <ul className="grid gap-2.5">
        {items.map((item) => {
          const seeksRival = item.seeking === 'rival'
          const filled = Math.min(item.confirmedCount, item.capacity)
          return (
            <li key={item.id}>
              <Link
                href={`/rival/partido/${item.id}`}
                className="glass-painted grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 rounded-3xl p-4 text-portal-ink transition-transform duration-250 ease-(--portal-ease-out) hover:-translate-y-0.5 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      TAG,
                      seeksRival
                        ? 'border-portal-inner-line bg-portal-inner text-portal-ink'
                        : 'border-portal-slot-line bg-portal-slot text-portal-slot-ink',
                    )}
                  >
                    {matchTypeLabel(item)}
                  </span>
                  <span className="text-base font-semibold">
                    {formatLabel(item.format)} · {whenLabel(item.startsAt, now)}
                  </span>
                </span>
                <span className="inline-flex min-h-10 max-w-40 items-center justify-center rounded-full bg-linear-to-b from-(--portal-btn-a) to-(--portal-btn-b) px-4 py-1 text-center text-sm leading-4 font-semibold text-portal-on-green shadow-[inset_0_1px_0_rgb(255_255_255/.45)]">
                  {seeksRival ? 'Pedir jugar con mi equipo' : 'Pedir sumarme'}
                </span>
                <span className="col-span-full text-sm text-portal-soft">
                  Ya son {filled} de {item.capacity}
                </span>
                <span
                  aria-hidden
                  className="col-span-full block h-1.5 overflow-hidden rounded-full bg-portal-inner-line"
                >
                  <span
                    className="block h-full rounded-full bg-portal-green"
                    style={{ width: `${(filled / item.capacity) * 100}%` }}
                  />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
