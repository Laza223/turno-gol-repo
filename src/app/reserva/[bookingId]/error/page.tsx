import Link from 'next/link'
import { XCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function ReservaErrorPage({ params }: { params: { bookingId: string } }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 ring-8 ring-red-50">
        <XCircle className="h-8 w-8 text-red-600" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">El pago no se completó</h1>
      <p className="mt-3 text-sm text-slate-600">No pudimos confirmar la seña, así que el turno quedó liberado. Podés intentar reservar de nuevo.</p>
      <Link href="/explorar" className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
        Buscar otro turno
      </Link>
      <span className="sr-only">Reserva {params.bookingId}</span>
    </div>
  )
}
