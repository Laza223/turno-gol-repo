import Link from 'next/link'
import PitchLines from './PitchLines'

export default function EmptyResults({
  avail,
  /**
   * La página pedida quedó fuera de rango (`?offset=` más allá del total), no es
   * que no haya resultados. Sin esto el body decía "no encontramos complejos"
   * mientras el toolbar seguía mostrando el total real — dos afirmaciones
   * contradictorias en la misma pantalla (🟡 QA 2026-08-14; misma clase que el
   * EmptyState de /jugadores con `?pagina=999`).
   */
  outOfRange = false,
}: {
  avail?: { date: string; time: string } | null
  outOfRange?: boolean
}) {
  if (outOfRange) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card py-16 text-center shadow-xs">
        <div className="relative h-24 w-48 text-emerald-600/25 dark:text-emerald-400/25">
          <PitchLines variant="empty" className="h-full w-full" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
            No hay más complejos para mostrar
          </h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Llegaste al final de la lista. Volvé al principio para verlos todos.
          </p>
        </div>
        <Link
          href="/explorar"
          className="inline-flex h-11 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-emerald-600/30 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25"
        >
          Volver al principio
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card py-16 text-center shadow-xs">
      <div className="relative h-24 w-48 text-emerald-600/25 dark:text-emerald-400/25">
        <PitchLines variant="empty" className="h-full w-full" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
          {avail ? 'Sin disponibilidad en ese horario' : 'Sin resultados para tu búsqueda'}
        </h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {avail
            ? `No encontramos complejos con disponibilidad el ${avail.date.split('-').reverse().join('/')} a las ${avail.time}. Probá con otro horario o fecha.`
            : 'No encontramos complejos con los filtros seleccionados. Probá ajustando tu búsqueda.'}
        </p>
      </div>
      <Link
        href="/explorar"
        className="inline-flex h-11 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-emerald-600/30 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25"
      >
        Limpiar búsqueda
      </Link>
    </div>
  )
}
