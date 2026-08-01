'use client'

import { useFormStatus } from 'react-dom'
import { ShieldCheck } from 'lucide-react'
import type { createBookingAndCheckout } from '../actions'
import PaymentMethodSelector, { type PayMethod } from './PaymentMethodSelector'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'

function Inner({ depositAmount }: { depositAmount: number }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="inline-flex h-[58px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 text-base font-bold text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_30px_rgba(16,185,129,0.3)] transition-all duration-200 hover:brightness-105 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_12px_36px_rgba(16,185,129,0.4)] active:scale-[0.97] disabled:scale-100 disabled:opacity-60 whitespace-nowrap">
      {pending ? <><TgBallSpinner size="xs" className="mr-1" aria-hidden /> Procesando…</> : (
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
  action: typeof createBookingAndCheckout
}) {
  return (
    <form action={props.action} className="space-y-4">
      <input type="hidden" name="slug" value={props.slug} />
      <input type="hidden" name="court" value={props.court} />
      <input type="hidden" name="date" value={props.date} />
      <input type="hidden" name="time" value={props.time} />
      <input type="hidden" name="dur" value={props.dur} />

      <PaymentMethodSelector methods={props.payMethods} />

      <Inner depositAmount={props.depositAmount} />
    </form>
  )
}
