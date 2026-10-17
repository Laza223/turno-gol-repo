'use client'

import { useState } from 'react'
import { buildReservarHref, replaceReserveUrl, type PayMethod } from '@/lib/booking/reserve-url'
import type { createBookingAndCheckout, sendPlayerMagicLink } from '../actions'
import ConfirmBookingButton from './ConfirmBookingButton'
import LoginGate, { type StartGoogleLoginFromReservar } from './LoginGate'
import PaymentMethodSelector from './PaymentMethodSelector'

/**
 * La política de cancelación en una línea, sacada de la regla real del complejo. Con seña se dice
 * la regla de las horas; sin seña no se promete ningún plazo que el complejo no fijó. La devolución
 * la hace el complejo (TurnoGol no reembolsa por API): el texto lo dice con esas palabras.
 */
function cancellationNote(hours: number, withDeposit: boolean): string {
  if (!withDeposit) return 'Podés cancelar desde Mis reservas.'
  const rule =
    hours === 0
      ? 'antes de que empiece el turno'
      : `con más de ${hours === 1 ? '1 hora' : `${hours} horas`} de anticipación`
  return `Si cancelás ${rule}, el complejo te devuelve la seña. Después, la seña queda en el complejo.`
}

/**
 * Lo que va debajo del resumen: cómo se paga, la política de cancelación y, según la sesión, el
 * botón de confirmar o el ingreso. Existe para tener UNA sola copia de `pay`: lo elige el selector,
 * se escribe en la URL (`replaceState`, como la ficha) y viaja en el `next` del ingreso y en el
 * form de confirmar, así sobrevive al ingreso y a los reintentos.
 *
 * Las Server Actions entran por PROP: '../actions' es `'use server'` y arrastra
 * `request-context` → `node:async_hooks`, que Vite externaliza en el browser y rompe las stories.
 */
export default function CheckoutFlow({
  slug,
  court,
  date,
  time,
  dur,
  formato,
  methods,
  initialPay,
  withDeposit,
  hidePrices = false,
  cancellationHours,
  isPlayer,
  inAppBrowser,
  createAction,
  sendLinkAction,
  googleAction,
}: {
  slug: string
  court: string
  date: string
  time: string
  dur: number
  formato: number | null
  methods: PayMethod[]
  initialPay: PayMethod | null
  withDeposit: boolean
  /** El complejo oculta sus precios: la sección de pago dice lo que el resumen no puede decir. */
  hidePrices?: boolean
  cancellationHours: number
  isPlayer: boolean
  inAppBrowser: boolean
  createAction: typeof createBookingAndCheckout
  sendLinkAction: typeof sendPlayerMagicLink
  googleAction: StartGoogleLoginFromReservar
}) {
  const [pay, setPay] = useState(initialPay)
  const choose = (method: PayMethod) => {
    setPay(method)
    replaceReserveUrl({ pay: method })
  }

  return (
    <>
      <PaymentMethodSelector
        methods={methods}
        value={pay}
        onChange={choose}
        hidePrices={hidePrices}
      >
        {cancellationNote(cancellationHours, withDeposit)}
      </PaymentMethodSelector>
      {isPlayer ? (
        <ConfirmBookingButton
          slug={slug}
          court={court}
          date={date}
          time={time}
          dur={dur}
          formato={formato}
          pay={pay}
          withDeposit={withDeposit}
          action={createAction}
        />
      ) : (
        <LoginGate
          next={buildReservarHref(slug, { courtId: court, date, time, formato, pay })}
          action={sendLinkAction}
          googleAction={googleAction}
          inAppBrowser={inAppBrowser}
        />
      )}
    </>
  )
}
