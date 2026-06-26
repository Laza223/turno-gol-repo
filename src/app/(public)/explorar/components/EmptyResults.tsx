import Link from 'next/link'
import PitchLines from './PitchLines'

export default function EmptyResults({
  avail,
}: {
  avail?: { date: string; time: string } | null
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
      <div className="relative h-24 w-48 text-emerald-600/25">
        <PitchLines variant="empty" className="h-full w-full" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
          {avail ? 'Sin turnos a esa hora' : 'No hay resultados'}
        </h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {avail
            ? `No hay complejos con turnos libres el ${avail.date.split('-').reverse().join('/')} a las ${avail.time}. Probá otro horario.`
            : 'No encontramos complejos con esos filtros. Probá ampliar la búsqueda.'}
        </p>
      </div>
      <Link
        href="/explorar"
        className="inline-flex h-11 items-center rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/35 motion-reduce:hover:translate-y-0"
      >
        Limpiar búsqueda
      </Link>
    </div>
  )
}
