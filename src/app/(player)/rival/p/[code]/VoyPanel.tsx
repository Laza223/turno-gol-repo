'use client'

import { unstable_rethrow } from 'next/navigation'
import { startTransition, useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { FixedCta } from '@/app/(public)/[slug]/reservar/components/ConfirmBookingButton'
import { Button } from '@/components/ui/button'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'
import { RIVAL_OFFLINE_MESSAGE, voyLabel } from '@/modules/rival/rival-copy'
import type { RivalFormResult } from '../../actions'
import { FormError } from '../../FormError'
import { WelcomeCard, type WelcomeNeeds } from '../../WelcomeCard'
import { dropUrlParam } from './drop-url-param'

/** Firmas de las Server Actions (por prop, no por import: ver convenciones-stack). */
type JoinAction = (code: string) => Promise<RivalFormResult>
type AcceptAndJoinAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>

/** Lo que falta de la bienvenida (`needs`) y lo que el jugador ya tenía cargado. */
export type VoyWelcome = {
  firstName: string
  position: string | null
  zone: string | null
  needs: WelcomeNeeds
}

const STORAGE_PREFIX = 'tg-rival-auto-join:'

/**
 * "Voy" (el único verde del invitado, spec §5.2), en la barra fija de abajo como el de la reserva.
 * Con la bienvenida completa suma directo; si falta algo (el nombre y las reglas, o la posición y la
 * zona), "Voy" abre la tarjeta con solo lo que falta y su botón "Estoy adentro" lo guarda y suma en
 * un solo toque. "Ahora no" la cierra y vuelve "Voy".
 *
 * Vuelta del login con intento válido (`autoJoin`, solo si no falta nada): el form se envía solo
 * UNA vez, con el patrón de `AutoConfirm` (ref contra StrictMode + sessionStorage por partido + el
 * parámetro fuera de la URL antes de enviar). Con algo pendiente (`openWelcome`) NO hay autoenvío:
 * la tarjeta sale abierta y el toque explícito suma. Nunca queda adentro sin posición ni zona.
 *
 * El resultado ("Listo, estás adentro…" / "Quedaste en el banco…") lo pinta la vista del partido
 * desde el plantel que vuelve del servidor; acá solo se muestra el error.
 */
export function VoyPanel({
  code,
  welcome,
  autoJoin,
  openWelcome,
  full = false,
  intentParam,
  joinAction,
  acceptAndJoinAction,
}: {
  code: string
  /** `null` = no le falta nada: ya aceptó la bienvenida vigente y tiene posición y zona. */
  welcome: VoyWelcome | null
  autoJoin: boolean
  openWelcome: boolean
  /** Partido lleno: el botón dice "Voy al banco" para no prometer un lugar que no hay (decisión 11). */
  full?: boolean
  /** Nombre del param del intento en la URL (`RIVAL_INTENT_PARAM`): ese módulo importa `node:crypto`, no cruza al cliente. */
  intentParam: string
  joinAction: JoinAction
  acceptAndJoinAction: AcceptAndJoinAction
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const voyRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const started = useRef(false)
  const [pending, startJoin] = useTransition()
  const [error, setError] = useState<{ error: string; code?: string } | null>(null)
  // Quién abrió la tarjeta: el login (sale abierta) o un toque (el botón se desmonta). En los dos el foco va al título.
  const [opened, setOpened] = useState(openWelcome)

  // "Ahora no" desmonta la tarjeta y monta el botón de nuevo: el foco vuelve a él, no al body.
  useEffect(() => {
    if (opened || !restoreFocus.current) return
    restoreFocus.current = false
    voyRef.current?.focus()
  }, [opened])

  function join() {
    setError(null)
    startJoin(async () => {
      try {
        const res = await joinAction(code)
        if (!res.success) startTransition(() => setError({ error: res.error, code: res.code }))
      } catch (err) {
        // Un redirect o un notFound de la action viajan como excepción: no se tragan.
        unstable_rethrow(err)
        startTransition(() => setError({ error: RIVAL_OFFLINE_MESSAGE }))
      }
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    join()
  }

  // El autoenvío sale con el intento ya fuera de la URL (lo saca también `DropIntentParam`, pero acá
  // el orden importa). Diferido por la misma razón que ese componente: el router tiene que enterarse.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      dropUrlParam(intentParam)

      if (!autoJoin || welcome || started.current) return
      started.current = true
      const key = `${STORAGE_PREFIX}${code}`
      let alreadySent = false
      try {
        alreadySent = window.sessionStorage.getItem(key) !== null
        if (!alreadySent) window.sessionStorage.setItem(key, '1')
      } catch {
        // Sin sessionStorage (modo privado): queda el guard del ref.
      }
      if (alreadySent || !formRef.current) return
      formRef.current.requestSubmit()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [intentParam, autoJoin, welcome, code])

  if (welcome) {
    const { needs } = welcome
    return opened ? (
      <WelcomeCard
        needs={needs}
        defaultName={welcome.firstName}
        defaultPosition={welcome.position}
        defaultZone={welcome.zone}
        action={acceptAndJoinAction}
        submitLabel="Estoy adentro"
        intro={
          needs.identity && !needs.profile
            ? 'Para sumarte, confirmá tu nombre y aceptá las reglas.'
            : undefined
        }
        hidden={{ code }}
        pinSubmit
        onDismiss={() => {
          restoreFocus.current = true
          setOpened(false)
        }}
        focusOnMount
      />
    ) : (
      <FixedCta>
        <Button
          ref={voyRef}
          type="button"
          onClick={() => setOpened(true)}
          className={cn(PORTAL_BUTTON, 'min-h-[52px]')}
        >
          {voyLabel(full)}
        </Button>
      </FixedCta>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      {/* En el flujo, no en la barra: el alto de la barra es fijo y un error variable la haría tapar el final. */}
      {error && <FormError error={error.error} code={error.code} />}
      <FixedCta>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={cn(PORTAL_BUTTON, 'min-h-[52px]')}
        >
          {pending ? 'Sumándote…' : voyLabel(full)}
        </Button>
      </FixedCta>
    </form>
  )
}
