'use client'

import { useFormStatus } from 'react-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { createBookingAndCheckout } from '../actions'
import PaymentMethodSelector, { type PayMethod } from './PaymentMethodSelector'

function Inner({ depositAmount }: { depositAmount: number }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="inline-flex h-[58px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-base font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/35 disabled:translate-y-0 disabled:opacity-60 motion-reduce:hover:translate-y-0">
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
  payMethods: PayMethod[]
}) {
  return (
    <form action={createBookingAndCheckout} className="space-y-4">
      <input type="hidden" name="slug" value={props.slug} />
      <input type="hidden" name="court" value={props.court} />
      <input type="hidden" name="date" value={props.date} />
      <input type="hidden" name="time" value={props.time} />
      <input type="hidden" name="dur" value={props.dur} />
      <PaymentMethodSelector methods={props.payMethods} />
      <Inner depositAmount={props.depositAmount} />
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
        {props.depositAmount > 0 ? 'Te llevamos a MercadoPago para pagar la seña.' : 'Tu turno queda confirmado al instante.'}
      </p>
    </form>
  )
}
