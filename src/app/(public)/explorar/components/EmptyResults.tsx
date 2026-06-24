import Link from 'next/link'
import PitchLines from './PitchLines'

export default function EmptyResults({
  avail,
}: {
  avail?: { date: string; time: string } | null
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white py-16 text-center">
      <div className="relative h-24 w-48 text-emerald-600/25">
        <PitchLines variant="empty" className="h-full w-full" />
      </div>
      <p className="max-w-sm text-sm text-slate-500">
        {avail
          ? `No hay complejos con turnos libres el ${avail.date.split('-').reverse().join('/')} a las ${avail.time}.`
          : 'No encontramos complejos con esos filtros.'}
      </p>
      <Link
        href="/explorar"
        className="inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
      >
        Limpiar búsqueda
      </Link>
    </div>
  )
}
