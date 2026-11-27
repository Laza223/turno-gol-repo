'use client'

import type { ReactNode } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import { BOOKING_INTENT_PARAM, type PayMethod } from '@/lib/booking/reserve-url'
import { cn } from '@/lib/utils'
import type { createBookingAndCheckout } from '../actions'
import AutoConfirm from './AutoConfirm'

/**
 * Botón fijo abajo en el celular, por encima de la barra inferior del jugador
 * (`--portal-tabbar-space`); desde `md` queda en el flujo. Lo usa RIVAL: la pantalla de confirmar
 * ya no lo fija (portal de vidrio F5). `data-fixed-cta` es el aviso a `PortalFrame`: mientras esté
 * montado el marco suma su alto real (1 + 12 + 52 + 12 + 1 px: el borde va en los cuatro lados) a su padding inferior.
 *
 * En el celu es vidrio real (portal de vidrio F7): flota sobre la lista que pasa por detrás, como la
 * barra de "Reservar" de la ficha. Armado con utilidades, así que lleva `glass-pop` para entrar en
 * los respaldos sin desenfoque, con "reducir transparencia" y con "más contraste".
 */
export function FixedCta({ children }: { children: ReactNode }) {
  return (
    <div
      data-fixed-cta
      className={cn(
        'glass-pop fixed inset-x-2 bottom-(--portal-tabbar-space) z-30 rounded-[28px] border border-(--glass-line) bg-linear-to-b from-(--glass-a) to-(--glass-b) p-3 shadow-[inset_0_1px_0_var(--glass-hi),var(--glass-shadow)] backdrop-blur-[26px] backdrop-saturate-[1.8]',
        'md:static md:z-auto md:rounded-none md:border-0 md:bg-none md:p-0 md:shadow-none md:backdrop-filter-none',
      )}
    >
      {children}
    </div>
  )
}

/**
 * El botón de acción, con sesión (sin sesión, en su lugar va el ingreso: ver `CheckoutFlow`). Va en
 * el flujo, debajo del resumen, como en `reservar.html`: la píldora verde de 52 px. Un solo envío:
 * pendiente, "Procesando…" con el brillo de carga adentro y deshabilitado. Dice "Reservar", o
 * "Pagar seña" si hay seña (`label`).
 */
export default function ConfirmBookingButton(props: {
  slug: string
  court: string
  date: string
  time: string
  dur: number
  formato: number | null
  /** Solo de un link viejo (`?pay=`): ya no hay dónde elegirlo, pero la URL se respeta. */
  pay: PayMethod | null
  /** "Reservar" o "Pagar seña" (con el monto si el complejo muestra sus precios). */
  label: string
  /**
   * El vínculo firmado que la page ya verificó (vuelve del ingreso, sin seña): viaja en el form y
   * `AutoConfirm` lo envía una vez. Sin él, el botón es el de siempre.
   */
  autoConfirmToken?: string
  /** Vino un vínculo y no valió: una línea pide tocar el botón. Excluyente con `autoConfirmToken`. */
  intentDegraded?: boolean
  action: typeof createBookingAndCheckout
}) {
  return (
    <form action={props.action}>
      <input type="hidden" name="slug" value={props.slug} />
      <input type="hidden" name="court" value={props.court} />
      <input type="hidden" name="date" value={props.date} />
      <input type="hidden" name="time" value={props.time} />
      <input type="hidden" name="dur" value={props.dur} />
      {props.formato && <input type="hidden" name="formato" value={props.formato} />}
      {props.pay && <input type="hidden" name="pay" value={props.pay} />}
      {props.autoConfirmToken && (
        <>
          <input type="hidden" name={BOOKING_INTENT_PARAM} value={props.autoConfirmToken} />
          <AutoConfirm slug={props.slug} court={props.court} date={props.date} time={props.time} />
        </>
      )}
      {props.intentDegraded && (
        <p className="rv-sub mb-3 mt-0">
          Tocá &ldquo;{props.label}&rdquo; para confirmar tu turno.
        </p>
      )}

      {/* En el flujo, debajo del resumen (`reservar.html`): no va fijo abajo. */}
      <SubmitButton variant="pill" size="pill" className="rv-go w-full" pendingLabel="Confirmando…">
        {props.label}
      </SubmitButton>
    </form>
  )
}
