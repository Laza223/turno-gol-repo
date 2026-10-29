'use client'

import { useState } from 'react'
import LoginGate, {
  type RivalGatePurpose,
} from '@/app/(public)/[slug]/reservar/components/LoginGate'
import type { SendRivalMagicLink, StartGoogleLoginFromRival } from './p/[code]/login-actions'
import { RIVAL_ACTION } from './rival-classes'

/**
 * El botón de RIVAL que, sin sesión, abre el ingreso (variante RIVAL de `LoginGate`, mismo patrón
 * que la reserva: botón + modal) y vuelve a `next` con la cuenta creada. Sirve a los tres caminos
 * (`purpose`): "Voy" a un partido, "Armar un partido" y "Pedir sumarme". Las actions entran por
 * PROP: `login-actions` es `'use server'` y no se importa como valor desde un cliente.
 *
 * `className` cambia la forma del botón: por defecto el primario de la vista de un partido
 * (`RIVAL_ACTION`); las páginas de lista pasan su píldora.
 * `inAppBrowser` lo resuelve el servidor con el User-Agent (ver `LoginGate`).
 */
export function RivalEntryGate({
  next,
  label,
  purpose,
  sendMagicLink,
  startGoogle,
  inAppBrowser = false,
  className = RIVAL_ACTION,
}: {
  next: string
  label: string
  purpose: RivalGatePurpose
  sendMagicLink: SendRivalMagicLink
  startGoogle: StartGoogleLoginFromRival
  inAppBrowser?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        className={className}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <LoginGate
        variant="rival"
        purpose={purpose}
        open={open}
        onOpenChange={setOpen}
        next={next}
        action={sendMagicLink}
        googleAction={startGoogle}
        inAppBrowser={inAppBrowser}
      />
    </>
  )
}
