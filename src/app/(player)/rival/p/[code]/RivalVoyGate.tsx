'use client'

import { FixedCta } from '@/app/(public)/[slug]/reservar/components/ConfirmBookingButton'
import { cn } from '@/lib/utils'
import { voyLabel } from '@/modules/rival/rival-copy'
import { RIVAL_ACTION } from '../../rival-classes'
import { RivalEntryGate } from '../../RivalEntryGate'
import type { SendRivalMagicLink, StartGoogleLoginFromRival } from './login-actions'

/**
 * El "Voy" del jugador sin sesión: el ingreso de RIVAL con el `next` en el mismo partido, así que
 * vuelve a él con el vínculo firmado que prueba que tocó "Voy". Va en la barra fija de abajo (como
 * el de quien tiene sesión, 52 px): el invitado llega de WhatsApp con una sola intención y el
 * plantel no lo empuja fuera de la pantalla.
 */
export function RivalVoyGate({
  code,
  full = false,
  sendMagicLink,
  startGoogle,
  inAppBrowser = false,
}: {
  code: string
  /** Partido lleno: dice "Voy al banco" (decisión 11). */
  full?: boolean
  sendMagicLink: SendRivalMagicLink
  startGoogle: StartGoogleLoginFromRival
  inAppBrowser?: boolean
}) {
  return (
    <FixedCta>
      <RivalEntryGate
        next={`/rival/p/${code}`}
        label={voyLabel(full)}
        purpose="voy"
        sendMagicLink={sendMagicLink}
        startGoogle={startGoogle}
        inAppBrowser={inAppBrowser}
        className={cn(RIVAL_ACTION, 'min-h-[52px]')}
      />
    </FixedCta>
  )
}
