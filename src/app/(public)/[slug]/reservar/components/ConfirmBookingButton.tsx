'use client'

import { useFormStatus } from 'react-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { createBookingAndCheckout } from '../actions'

function Inner({ depositAmount }: { depositAmount: number }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0">
      {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Procesando…</> : (
        <><ShieldCheck className="h-4 w-4" aria-hidden /> {depositAmount > 0 ? 'Pagar seña y reservar' : 'Confirmar reserva'}</>
      )}
    </button>
  )
}

export default function ConfirmBookingButton(props: {
  slug: string
  court: string
  date: string
  time: string
  dur: number
  depositAmount: number
}) {
  return (
    <form action={createBookingAndCheckout} className="space-y-3">
      <input type="hidden" name="slug" value={props.slug} />
      <input type="hidden" name="court" value={props.court} />
      <input type="hidden" name="date" value={props.date} />
      <input type="hidden" name="time" value={props.time} />
      <input type="hidden" name="dur" value={props.dur} />
      <Inner depositAmount={props.depositAmount} />
      <p className="text-center text-xs text-slate-500">
        {props.depositAmount > 0 ? 'Te llevamos a MercadoPago para pagar la seña.' : 'Tu turno queda confirmado al instante.'}
      </p>
    </form>
  )
}
