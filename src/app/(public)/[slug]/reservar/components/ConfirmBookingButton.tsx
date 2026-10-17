'use client'

import { SubmitButton } from '@/components/ui/submit-button'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { BOOKING_INTENT_PARAM, type PayMethod } from '@/lib/booking/reserve-url'
import { cn } from '@/lib/utils'
import type { createBookingAndCheckout } from '../actions'
import AutoConfirm from './AutoConfirm'

/**
 * El botón de confirmar, con sesión. En el celular va fijo abajo (52 px) y SIEMPRE por encima de la
 * barra inferior del jugador (56 px de ítems + 1 px de borde + el área segura del iPhone, la misma
 * medida que reserva `PortalFrame`): este botón solo existe para jugadores, que siempre la tienen,
 * así que no espera a que la sesión se hidrate y no salta cuando llega. Desde `md` la barra
 * inferior no existe y el botón queda en el flujo, dentro de la columna. Un solo envío: pendiente,
 * "Procesando…" y deshabilitado.
 *
 * `data-fixed-cta` es el aviso a `PortalFrame`: mientras este contenedor esté montado el marco suma
 * su alto real (1 px de borde + 12 + 52 + 12 px) a su padding inferior, así el pie no queda tapado.
 * Si cambia el relleno o el alto del botón, cambia también esa cuenta en `PortalFrame`.
 */
export default function ConfirmBookingButton(props: {
  slug: string
  court: string
  date: string
  time: string
  dur: number
  formato: number | null
  /** Cómo paga; con seña es MercadoPago y la action lo ignora (la forma de pago la fija el webhook). */
  pay: PayMethod | null
  /** Solo si hay seña: el monto no viaja al browser (puede estar oculto). */
  withDeposit: boolean
  /**
   * El vínculo firmado que la page ya verificó (vuelve del ingreso, sin seña): viaja en el form y
   * `AutoConfirm` lo envía una vez. Sin él, el botón es el de siempre.
   */
  autoConfirmToken?: string
  /** Avisa que la confirmación sola arrancó (CheckoutFlow bloquea lo que ya no se puede cambiar). */
  onAutoConfirm?: () => void
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
          <AutoConfirm
            slug={props.slug}
            court={props.court}
            date={props.date}
            time={props.time}
            onConfirming={props.onAutoConfirm}
          />
        </>
      )}
      {props.intentDegraded && (
        <p className="mb-3 text-base text-muted-foreground">
          Tocá Confirmar reserva para terminar.
        </p>
      )}

      <div
        data-fixed-cta
        className={cn(
          'fixed inset-x-0 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-30 border-t border-border bg-card px-4 pt-3 pb-3 dark:bg-background',
          'md:static md:z-auto md:border-0 md:bg-transparent md:p-0 dark:md:bg-transparent',
        )}
      >
        <SubmitButton className={cn(PORTAL_BUTTON, 'min-h-[52px]')} pendingLabel="Procesando…">
          {props.withDeposit ? 'Pagar la seña' : 'Confirmar reserva'}
        </SubmitButton>
      </div>
    </form>
  )
}
