'use client'

import { unstable_rethrow } from 'next/navigation'
import { startTransition, useState, useTransition, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalFormResult } from '../../actions'
import { WelcomeCard, type WelcomePhoto } from '../../WelcomeCard'
import type { VoyWelcome } from '../../p/[code]/VoyPanel'

/** Firmas de las Server Actions (por prop, no por import: ver convenciones-stack). */
type RequestAction = (matchId: string) => Promise<ActionResult>
type AcceptAndRequestAction = (
  prev: RivalFormResult,
  formData: FormData,
) => Promise<RivalFormResult>

const OFFLINE = 'No pudimos conectar. Revisá tu conexión y probá de nuevo.'
const ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'

/**
 * El verde de la vista pública con sesión: "Pedir sumarme". Con la bienvenida
 * hecha pide directo; sin ella, el botón abre la tarjeta y su botón acepta y pide en un toque.
 * El resultado ("Pedido enviado…") lo pinta la vista del participante cuando la page vuelve a leer.
 */
export function RequestPanel({
  matchId,
  label,
  welcome,
  requestAction,
  acceptAndRequestAction,
  photo,
}: {
  matchId: string
  label: string
  /** `null` = ya aceptó la bienvenida de la versión vigente. */
  welcome: VoyWelcome | null
  requestAction: RequestAction
  acceptAndRequestAction: AcceptAndRequestAction
  /** Foto opcional de la tarjeta de bienvenida (solo con storage configurado). */
  photo?: WelcomePhoto
}) {
  const [pending, run] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [cardOpen, setCardOpen] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    run(async () => {
      try {
        const res = await requestAction(matchId)
        if (!res.success) startTransition(() => setError(res.error))
      } catch (err) {
        // Un redirect o un notFound de la action viajan como excepción: no se tragan.
        unstable_rethrow(err)
        startTransition(() => setError(OFFLINE))
      }
    })
  }

  if (welcome) {
    return cardOpen ? (
      <WelcomeCard
        defaultName={welcome.firstName}
        defaultPosition={welcome.position}
        defaultZone={welcome.zone}
        action={acceptAndRequestAction}
        submitLabel={label}
        intro="Para pedir tu lugar, contanos quién sos."
        hidden={{ matchId }}
        photo={photo}
      />
    ) : (
      <Button type="button" onClick={() => setCardOpen(true)} className={PORTAL_BUTTON}>
        {label}
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Button type="submit" disabled={pending} aria-busy={pending} className={PORTAL_BUTTON}>
        {pending ? 'Pidiendo…' : label}
      </Button>
      {error && (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      )}
    </form>
  )
}
