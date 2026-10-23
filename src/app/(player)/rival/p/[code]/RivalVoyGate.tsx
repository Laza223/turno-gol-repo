'use client'

import { useState } from 'react'
import LoginGate from '@/app/(public)/[slug]/reservar/components/LoginGate'
import { cn } from '@/lib/utils'
import { RIVAL_CTA } from '../../MatchBits'
import type { SendRivalMagicLink, StartGoogleLoginFromRival } from './login-actions'

/**
 * El "Voy" del jugador sin sesión: el botón verde abre el ingreso (variante RIVAL de `LoginGate`,
 * mismo patrón que la reserva: botón + modal) y el `next` es el mismo partido, así que vuelve a él
 * con el vínculo firmado que prueba que tocó "Voy". Las actions entran por PROP: `login-actions` es
 * `'use server'` y no se importa como valor desde un cliente.
 *
 * `inAppBrowser` lo resuelve el servidor con el User-Agent (ver `LoginGate`).
 */
export function RivalVoyGate({
  code,
  sendMagicLink,
  startGoogle,
  inAppBrowser = false,
}: {
  code: string
  sendMagicLink: SendRivalMagicLink
  startGoogle: StartGoogleLoginFromRival
  inAppBrowser?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        className={cn(RIVAL_CTA, 'w-full')}
        onClick={() => setOpen(true)}
      >
        Voy
      </button>
      <LoginGate
        variant="rival"
        open={open}
        onOpenChange={setOpen}
        next={`/rival/p/${code}`}
        action={sendMagicLink}
        googleAction={startGoogle}
        inAppBrowser={inAppBrowser}
      />
    </>
  )
}
