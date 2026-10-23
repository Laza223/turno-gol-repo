'use client'

import { unstable_rethrow } from 'next/navigation'
import { startTransition, useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalFormResult } from '../../actions'
import { WelcomeCard } from '../../WelcomeCard'
import { dropUrlParam } from './DropIntentParam'

/** Firmas de las Server Actions (por prop, no por import: ver convenciones-stack). */
type JoinAction = (code: string) => Promise<ActionResult>
type AcceptAndJoinAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>

export type VoyWelcome = { firstName: string; position: string | null; zone: string | null }

const STORAGE_PREFIX = 'tg-rival-auto-join:'
const OFFLINE = 'No pudimos conectar. Revisá tu conexión y probá de nuevo.'
const ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'

/**
 * "Voy" (el único verde del invitado, spec §5.2). Con la bienvenida aceptada suma directo; sin ella,
 * "Voy" abre la tarjeta y su botón "Estoy adentro" acepta y suma en un solo toque.
 *
 * Vuelta del login con intento válido (`autoJoin`, solo si la bienvenida ya está aceptada): el form
 * se envía solo UNA vez, con el patrón de `AutoConfirm` (ref contra StrictMode + sessionStorage por
 * partido + el parámetro fuera de la URL antes de enviar). Sin bienvenida (`openWelcome`) NO hay
 * autoenvío: la tarjeta sale abierta y el consentimiento pide el toque explícito.
 *
 * El resultado ("Listo, estás adentro…" / "Quedaste en el banco…") lo pinta la vista del partido
 * desde el plantel que vuelve del servidor; acá solo se muestra el error.
 */
export function VoyPanel({
  code,
  welcome,
  autoJoin,
  openWelcome,
  intentParam,
  joinAction,
  acceptAndJoinAction,
}: {
  code: string
  /** `null` = ya aceptó la bienvenida de la versión vigente. */
  welcome: VoyWelcome | null
  autoJoin: boolean
  openWelcome: boolean
  /** Nombre del param del intento en la URL (`RIVAL_INTENT_PARAM`): ese módulo importa `node:crypto`, no cruza al cliente. */
  intentParam: string
  joinAction: JoinAction
  acceptAndJoinAction: AcceptAndJoinAction
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const started = useRef(false)
  const [pending, startJoin] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [cardOpen, setCardOpen] = useState(openWelcome)

  function join() {
    setError(null)
    startJoin(async () => {
      try {
        const res = await joinAction(code)
        if (!res.success) startTransition(() => setError(res.error))
      } catch (err) {
        // Un redirect o un notFound de la action viajan como excepción: no se tragan.
        unstable_rethrow(err)
        startTransition(() => setError(OFFLINE))
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
    return cardOpen ? (
      <WelcomeCard
        defaultName={welcome.firstName}
        defaultPosition={welcome.position}
        defaultZone={welcome.zone}
        action={acceptAndJoinAction}
        submitLabel="Estoy adentro"
        intro="Para sumarte, contanos quién sos."
        hidden={{ code }}
      />
    ) : (
      <Button type="button" onClick={() => setCardOpen(true)} className={PORTAL_BUTTON}>
        Voy
      </Button>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <Button type="submit" disabled={pending} aria-busy={pending} className={PORTAL_BUTTON}>
        {pending ? 'Sumándote…' : 'Voy'}
      </Button>
      {error && (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      )}
    </form>
  )
}
