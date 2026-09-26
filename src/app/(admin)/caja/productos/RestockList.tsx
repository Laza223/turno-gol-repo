import { Button } from '@/components/ui/button'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import { nightsOfStockLeft, productsToRestock, stockBadgeToneClass } from '../caja-lib'

type Props = {
  products: CanteenProductRow[]
  /** Unidades vendidas por producto en los últimos 7 días. Sin entrada = no se vendió. */
  unitsLast7Days: Record<string, number>
  onRestock: (product: CanteenProductRow) => void
}

type Item = { product: CanteenProductRow; units: number; nights: number | null }

/**
 * Lo que se acaba primero, arriba: un agotado siempre (vale 0 noches aunque no
 * se haya vendido en la semana). Lo que tiene stock y no se vendió no apura: al
 * final.
 */
function urgency({ product, nights }: Item): number {
  if ((product.stock ?? 0) <= 0) return 0
  return nights ?? Number.MAX_SAFE_INTEGER
}

function byUrgency(a: Item, b: Item): number {
  return urgency(a) - urgency(b)
}

/** "al ritmo de esta semana alcanza 8 noches", o lo que se pueda decir sin ritmo. */
function paceText({ product, units, nights }: Item): string {
  if ((product.stock ?? 0) <= 0) {
    return units > 0 ? `esta semana se vendieron ${units}` : 'no se vendió esta semana'
  }
  if (nights === null) return 'no se vendió esta semana'
  if (nights === 0) return 'al ritmo de esta semana no alcanza para una noche'
  return `al ritmo de esta semana alcanza ${nights} ${nights === 1 ? 'noche' : 'noches'}`
}

/**
 * "Para reponer": lo primero de Productos (variante elegida por el dueño el
 * 2026-09-26). Los mismos productos que marca el punto ámbar de la pestaña
 * (`productsToRestock`), cada uno con para cuántas noches le alcanza al ritmo
 * de la última semana — es lo que decide si hay que ir a comprar hoy o el
 * viernes. Sin nada para reponer no se muestra: una tarjeta que dice "todo
 * bien" es ruido.
 */
export function RestockList({ products, unitsLast7Days, onRestock }: Props) {
  const items = productsToRestock(products)
    .map((product): Item => {
      const units = unitsLast7Days[product.id] ?? 0
      return { product, units, nights: nightsOfStockLeft(product.stock, units) }
    })
    .sort(byUrgency)

  if (items.length === 0) return null

  return (
    <section aria-labelledby="reponer-titulo" className="card-premium px-4 py-3 sm:px-5">
      <h2 id="reponer-titulo" className={cn('text-sm font-semibold', TONE_TEXT.warning)}>
        Para reponer <span className="tabular-nums">· {items.length}</span>
      </h2>
      <ul className="mt-1 divide-y divide-border">
        {items.map((item) => {
          const { product: p } = item
          const out = (p.stock ?? 0) <= 0
          const min = p.minStock != null ? ` (mínimo ${p.minStock})` : ''
          return (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <p className="min-w-0 text-sm">
                <span className="font-semibold text-foreground">{p.name}</span>{' '}
                {out ? (
                  <span className={cn('font-medium', stockBadgeToneClass('out'))}>agotado</span>
                ) : (
                  <span className="text-muted-foreground">
                    {p.stock === 1 ? 'queda 1' : `quedan ${p.stock}`}
                    {min}
                  </span>
                )}
                <span className="text-muted-foreground"> · {paceText(item)}</span>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-11 shrink-0 md:h-9"
                aria-label={`Reponer ${p.name}`}
                onClick={() => onRestock(p)}
              >
                Reponer
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
