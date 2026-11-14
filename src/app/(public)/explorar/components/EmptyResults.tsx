import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Sin resultados en /explorar, en vidrio pintado (portal de vidrio, F3). Con los textos de siempre.
 */
export default function EmptyResults({
  /**
   * La página pedida quedó fuera de rango (`?offset=` más allá del total), no es
   * que no haya resultados. Sin esto el body decía "no encontramos complejos"
   * mientras el encabezado seguía mostrando el total real — dos afirmaciones
   * contradictorias en la misma pantalla (🟡 QA 2026-08-14; misma clase que el
   * EmptyState de /jugadores con `?pagina=999`).
   */
  outOfRange = false,
}: {
  outOfRange?: boolean
}) {
  const [title, body, cta] = outOfRange
    ? [
        'No hay más complejos para mostrar',
        'Llegaste al final de la lista. Volvé al principio para verlos todos.',
        'Volver al principio',
      ]
    : [
        'Sin resultados para tu búsqueda',
        'No encontramos complejos con los filtros seleccionados. Probá ajustando tu búsqueda.',
        'Limpiar búsqueda',
      ]
  return (
    <div className="glass-painted flex flex-col items-center gap-4 rounded-[28px] px-6 py-14 text-center">
      <div className="space-y-1.5">
        <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-portal-ink">
          {title}
        </h2>
        <p className="mx-auto max-w-sm text-[15px] leading-[1.45] text-portal-soft">{body}</p>
      </div>
      <Link
        href="/explorar"
        className={cn(buttonVariants({ variant: 'pill', size: 'pill-sm' }), 'px-6')}
      >
        {cta}
      </Link>
    </div>
  )
}
