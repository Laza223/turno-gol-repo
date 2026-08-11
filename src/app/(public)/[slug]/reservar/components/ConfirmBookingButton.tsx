'use client'

import { useFormStatus } from 'react-dom'
import { ShieldCheck } from 'lucide-react'
import type { createBookingAndCheckout } from '../actions'
import PaymentMethodSelector, { type PayMethod } from './PaymentMethodSelector'
import { Button } from '@/components/ui/button'

function Inner({ depositAmount }: { depositAmount: number }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      isLoading={pending}
      // h-[58px] repetido en md: — el size="default" de <Button> trae md:h-10, que
      // twMerge no deduplica contra un h-[58px] sin prefijo (breakpoints distintos).
      className="h-[58px] md:h-[58px] w-full gap-2 rounded-xl text-base font-bold"
    >
      {pending ? (
        'Procesando…'
      ) : (
        <>
          <ShieldCheck className="h-4 w-4" aria-hidden />{' '}
          {depositAmount > 0 ? 'Pagar seña y reservar' : 'Confirmar reserva'}
        </>
      )}
    </Button>
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
