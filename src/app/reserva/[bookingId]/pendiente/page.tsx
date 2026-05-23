import Link from 'next/link'
import { Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function ReservaPendientePage({ params }: { params: { bookingId: string } }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 ring-8 ring-amber-50">
        <Clock className="h-8 w-8 text-amber-600" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pago en proceso</h1>
      <p className="mt-3 text-sm text-slate-600">Tu pago está siendo procesado. Te avisamos por email cuando se confirme la reserva.</p>
      <Link href="/mis-reservas" className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
        Ver mis reservas
      </Link>
      <span className="sr-only">Reserva {params.bookingId}</span>
    </div>
  )
}
