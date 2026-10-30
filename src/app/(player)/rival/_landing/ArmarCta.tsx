'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import LoginGate from '@/app/(public)/[slug]/reservar/components/LoginGate'
import { usePortalSession } from '@/components/site/PortalSessionProvider'
import type { SendRivalMagicLink, StartGoogleLoginFromRival } from '../p/[code]/login-actions'

/** Las actions del ingreso de RIVAL: entran por prop porque `login-actions` es `'use server'`. */
export type LandingEntry = {
  sendMagicLink: SendRivalMagicLink
  startGoogle: StartGoogleLoginFromRival
  inAppBrowser: boolean
}

const NEXT = '/rival/nuevo'

/**
 * "Armá tu partido" de la landing. Con sesión es un link a `/rival/nuevo`; sin sesión abre el
 * ingreso de RIVAL (el mismo `LoginGate` que el tablón), que crea la cuenta y vuelve a armar.
 * Mandarlo a `/rival/nuevo` sin sesión lo dejaría en `/ingresar`, que por email no crea cuentas.
 */
export function ArmarCta({
  entry,
  className,
  ariaLabel,
  sceneView = false,
  children,
}: {
  entry: LandingEntry
  className: string
  ariaLabel?: string
  /** El bloque ARMALO es una escena de paso del motor (`data-scene="view"`). */
  sceneView?: boolean
  children: ReactNode
}) {
  const { session } = usePortalSession()
  const [open, setOpen] = useState(false)
  const scene = sceneView ? { 'data-scene': 'view' } : {}

  if (session) {
    return (
      <Link className={className} href={NEXT} aria-label={ariaLabel} {...scene}>
        {children}
      </Link>
    )
  }
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={className}
        onClick={() => setOpen(true)}
        {...scene}
      >
        {children}
      </button>
      <LoginGate
        variant="rival"
        purpose="armar"
        open={open}
        onOpenChange={setOpen}
        next={NEXT}
        action={entry.sendMagicLink}
        googleAction={entry.startGoogle}
        inAppBrowser={entry.inAppBrowser}
      />
    </>
  )
}
