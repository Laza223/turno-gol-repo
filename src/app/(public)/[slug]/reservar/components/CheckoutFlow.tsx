'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { buildReservarHref, type PayMethod } from '@/lib/booking/reserve-url'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { createBookingAndCheckout, sendPlayerMagicLink } from '../actions'
import ConfirmBookingButton, { FixedCta } from './ConfirmBookingButton'
import LoginGate, { type StartGoogleLoginFromReservar } from './LoginGate'

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
 * Lo que va debajo del resumen: UN botón de acción y, junto a él, la regla de cancelación. Con seña
 * dice "Pagar seña" (con el monto si el complejo muestra sus precios); sin seña, "Reservar". Es el
 * mismo botón con y sin sesión: con sesión envía la reserva, sin sesión abre el ingreso (un modal,
 * `LoginGate`) y el `next` del ingreso lleva la reserva para que sobreviva a la vuelta.
 *
 * Ya no se elige cómo se paga en el complejo: sin seña la reserva se crea sin método presencial.
 * `pay` solo existe para no romper un link viejo con `?pay=`: si viene, viaja igual.
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
  pay,
  withDeposit,
  depositAmount,
  hidePrices = false,
  cancellationHours,
  isPlayer,
  autoConfirmToken,
  intentDegraded = false,
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
  /** El `?pay=` de un link viejo, ya validado; ninguna pantalla lo ofrece. */
  pay: PayMethod | null
  withDeposit: boolean
  /** Centavos de la seña, solo si el complejo muestra sus precios: con `hidePrices` no viaja. */
  depositAmount?: number
  /** El complejo oculta sus precios: la nota del botón dice lo que el resumen no puede decir. */
  hidePrices?: boolean
  cancellationHours: number
  isPlayer: boolean
  /** Vínculo ya verificado por la page: el form de confirmar se envía solo, una vez. */
  autoConfirmToken?: string
  /** Vino un vínculo y no valió (vencido, de otro email, de otro turno): la pantalla lo dice. */
  intentDegraded?: boolean
  inAppBrowser: boolean
  createAction: typeof createBookingAndCheckout
  sendLinkAction: typeof sendPlayerMagicLink
  googleAction: StartGoogleLoginFromReservar
}) {
  const [loginOpen, setLoginOpen] = useState(false)
  const label = withDeposit
    ? depositAmount && !hidePrices
      ? `Pagar seña · ${formatArs(depositAmount)}`
      : 'Pagar seña'
    : 'Reservar'

  return (
    <>
      {isPlayer ? (
        <ConfirmBookingButton
          slug={slug}
          court={court}
          date={date}
          time={time}
          dur={dur}
          formato={formato}
          pay={pay}
          label={label}
          autoConfirmToken={autoConfirmToken}
          intentDegraded={intentDegraded}
          action={createAction}
        />
      ) : (
        <>
          <FixedCta>
            <Button
              type="button"
              aria-haspopup="dialog"
              className={cn(PORTAL_BUTTON, 'min-h-[52px]')}
              onClick={() => setLoginOpen(true)}
            >
              {label}
            </Button>
          </FixedCta>
          <LoginGate
            open={loginOpen}
            onOpenChange={setLoginOpen}
            next={buildReservarHref(slug, { courtId: court, date, time, formato, pay })}
            action={sendLinkAction}
            googleAction={googleAction}
            inAppBrowser={inAppBrowser}
            withDeposit={withDeposit}
          />
        </>
      )}
      {/* Debajo del botón (en el celular el botón va fijo abajo y esto queda sobre él, en el flujo). */}
      <div className="space-y-1 text-sm text-muted-foreground">
        {withDeposit && hidePrices && (
          <p>Pagás una seña online con MercadoPago; el resto, en el complejo.</p>
        )}
        <p>{cancellationNote(cancellationHours, withDeposit)}</p>
      </div>
    </>
  )
}
