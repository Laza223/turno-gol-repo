'use client'

import { unstable_rethrow } from 'next/navigation'
import { startTransition, useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { FixedCta } from '@/app/(public)/[slug]/reservar/components/ConfirmBookingButton'
import { Button } from '@/components/ui/button'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'
import { RIVAL_OFFLINE_MESSAGE } from '@/modules/rival/rival-copy'
import type { RivalFormResult } from '../../actions'
import { FormError } from '../../FormError'
import { WelcomeCard, type WelcomeNeeds } from '../../WelcomeCard'

/** Firmas de las Server Actions (por prop, no por import: ver convenciones-stack). */
type RequestAction = (matchId: string) => Promise<RivalFormResult>
type AcceptAndRequestAction = (
  prev: RivalFormResult,
  formData: FormData,
) => Promise<RivalFormResult>

/** Lo que la tarjeta necesita de quien mira: sus datos de antes y lo que le falta pedir. */
export type RequestWelcome = {
  firstName: string
  position: string | null
  zone: string | null
  needs: WelcomeNeeds
}

/** Cómo arranca la tarjeta según lo que falta: sin nombre ni reglas pendientes, el intro por defecto es el del perfil. */
function introFor(needs: WelcomeNeeds, seeksRival: boolean): string | undefined {
  if (!needs.identity) return undefined
  const what = seeksRival ? 'jugar con tu equipo' : 'tu lugar'
  return needs.profile
    ? `Para pedir ${what}, contanos quién sos.`
    : `Para pedir ${what}, confirmá tu nombre y aceptá las reglas.`
}

/**
 * El verde de la vista pública con sesión: "Pedir sumarme". Con todo al día pide directo; si falta
 * algo (nombre y reglas, o posición y zona), el botón abre la tarjeta con solo eso y su botón
 * completa y pide en un toque ("Ahora no" la cierra). Sin foto: es el paso de sumarse. El botón de
 * la tarjeta abierta va, igual que el "Voy", en la barra fija de abajo (un solo botón fijo a la vez).
 * El resultado ("Pedido enviado…") lo pinta la vista del participante cuando la page vuelve a leer.
 */
export function RequestPanel({
  matchId,
  label,
  seeksRival = false,
  welcome,
  requestAction,
  acceptAndRequestAction,
}: {
  matchId: string
  label: string
  /** El partido busca rival: quien pide es capitán de otro equipo, no un jugador suelto. */
  seeksRival?: boolean
  /** `null` = no falta nada: la bienvenida de la versión vigente está aceptada y el perfil, completo. */
  welcome: RequestWelcome | null
  requestAction: RequestAction
  acceptAndRequestAction: AcceptAndRequestAction
}) {
  const [pending, run] = useTransition()
  const [error, setError] = useState<{ error: string; code?: string } | null>(null)
  const [cardOpen, setCardOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)

  // "Ahora no" desmonta la tarjeta y monta el botón de nuevo: el foco vuelve a él, no al body.
  useEffect(() => {
    if (cardOpen || !restoreFocus.current) return
    restoreFocus.current = false
    buttonRef.current?.focus()
  }, [cardOpen])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    run(async () => {
      try {
        const res = await requestAction(matchId)
        if (!res.success) startTransition(() => setError({ error: res.error, code: res.code }))
      } catch (err) {
        // Un redirect o un notFound de la action viajan como excepción: no se tragan.
        unstable_rethrow(err)
        startTransition(() => setError({ error: RIVAL_OFFLINE_MESSAGE }))
      }
    })
  }

  // 52 px: la barra fija de `PortalFrame` reserva ese alto (ver `FixedCta`).
  const fixedButton = cn(PORTAL_BUTTON, 'min-h-[52px]')

  if (welcome) {
    return cardOpen ? (
      <WelcomeCard
        needs={welcome.needs}
        defaultName={welcome.firstName}
        defaultPosition={welcome.position}
        defaultZone={welcome.zone}
        action={acceptAndRequestAction}
        submitLabel={label}
        intro={introFor(welcome.needs, seeksRival)}
        hidden={{ matchId }}
        pinSubmit
        onDismiss={() => {
          restoreFocus.current = true
          setCardOpen(false)
        }}
        focusOnMount
      />
    ) : (
      <FixedCta>
        <Button
          ref={buttonRef}
          type="button"
          onClick={() => setCardOpen(true)}
          className={fixedButton}
        >
          {label}
        </Button>
      </FixedCta>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* En el flujo, no en la barra: el alto de la barra es fijo y un error variable la haría tapar el final. */}
      {error && <FormError error={error.error} code={error.code} />}
      <FixedCta>
        <Button type="submit" disabled={pending} aria-busy={pending} className={fixedButton}>
          {pending ? 'Enviando pedido…' : label}
        </Button>
      </FixedCta>
    </form>
  )
}
