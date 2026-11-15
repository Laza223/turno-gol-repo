'use client'

import { Suspense, useActionState, useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import { GoogleIcon } from '@/components/icons/GoogleIcon'
import { InAppBrowserNotice } from '@/components/world/InAppBrowserNotice'
import { GLASS_INPUT, PORTAL_LINK } from '@/components/world/portal-auth-styles'
import {
  ResendLinkForm,
  callMailAction,
  errorOf,
  type MailState,
} from '@/components/world/MagicLinkSent'
import { echoFields } from '@/shared/forms/echo'
import { cn } from '@/lib/utils'
import type { PlayerLoginState, startGoogleLoginFromIngresar } from './actions'

/** El email que se tipeó, para no perderlo si la request no llegó. */
type LoginEcho = { email?: string }
type LoginState = MailState<PlayerLoginState, LoginEcho>

const initial = { status: 'idle', at: 0 } as const satisfies LoginState

/** Firma de la Server Action que consume el form. */
export type PlayerLoginAction = (
  prevState: PlayerLoginState,
  formData: FormData,
) => Promise<PlayerLoginState>
export type StartGoogleLoginFromIngresar = typeof startGoogleLoginFromIngresar

/** Si se llega desde RIVAL (lo decide page.tsx con `next` ya sanitizado): `partidos` o el resto. */
export type RivalIngreso = 'partidos' | 'general'

const RIVAL_TITLE: Record<RivalIngreso, { h1: string; sub: string }> = {
  partidos: {
    h1: 'Entrá a tus partidos',
    sub: 'Usá tu cuenta de TurnoGol para ver los partidos que organizás y en los que te sumaste.',
  },
  general: {
    h1: 'Entrá a RIVAL',
    sub: 'Usá tu cuenta de TurnoGol para seguir donde estabas.',
  },
}

const callLogin = (action: PlayerLoginAction, prev: LoginState, formData: FormData) =>
  callMailAction(action, prev, formData, {
    scope: 'ingresar',
    echo: (fd): LoginEcho => ({ email: echoFields(fd, ['email'] as const).email }),
  })

/**
 * El link a Explorar: el mismo en el formulario y en el bloque de primera vez del "enviado".
 * El padding vertical en un elemento EN LÍNEA no cambia el alto del renglón ni el layout, pero
 * agranda el área que recibe el toque a 44 px o más (también en cada fragmento si el link parte).
 */
const exploreLinkClass = cn(PORTAL_LINK, 'rv-link py-4')

/** El botón de Google y el email, en vidrio: el mismo criterio que el ingreso de `/reservar`. */
const GOOGLE_BUTTON = {
  variant: 'pill-glass',
  size: 'pill',
  className: 'w-full backdrop-filter-none',
} as const
const GHOST_BUTTON = {
  variant: 'pill-link',
  size: 'pill-sm',
  className: 'disabled:opacity-100 disabled:text-portal-muted',
} as const

/**
 * Puerta del complejo: /ingresar es el login del JUGADOR, y desde el celu la barra no trae "Para
 * complejos". Sin esto el dueño, con cuenta o sin ella, no tenía cómo llegar a /login ni a /register.
 * Va en el formulario y en el "enviado" (quien tipeó el mail del complejo espera un enlace que no
 * llega). Links planos y no `IngresarLink`: el destino no es /ingresar. Cada uno mide 44 px.
 */
function ComplejoLinks() {
  const linkClass = cn(PORTAL_LINK, 'rv-link inline-flex min-h-11 items-center')
  return (
    <div className="pa-auth__alt glass rv-rise" style={{ '--i': 2 } as CSSProperties}>
      <p>¿Tenés un complejo?</p>
      <div className="flex flex-wrap items-center justify-center gap-x-5">
        <Link href="/login" className={linkClass}>
          Entrar a mi panel
        </Link>
        <Link href="/register" className={linkClass}>
          Registrar mi complejo
        </Link>
      </div>
    </div>
  )
}

/**
 * Bloque cliente de /ingresar (aviso ?deleted=1 + magic link). La action llega
 * por PROP: './actions' es `'use server'` y arrastra request-context →
 * `node:async_hooks`, que Vite externaliza en el browser y rompe la story si
 * se importa como valor.
 *
 * `inAppBrowser` lo resuelve el servidor (page.tsx) con el User-Agent: en el navegador
 * interno de Instagram, Facebook o TikTok va primero el email y, en lugar de Google, que ahí no
 * deja entrar, el aviso para abrir la página en el navegador (`InAppBrowserNotice`).
 */
export function IngresarForm({
  action,
  googleAction,
  inAppBrowser = false,
  rival,
}: {
  action: PlayerLoginAction
  googleAction: StartGoogleLoginFromIngresar
  inAppBrowser?: boolean
  rival?: RivalIngreso
}) {
  return (
    <Suspense fallback={null}>
      <DeletedNotice />
      <FormCard
        action={action}
        googleAction={googleAction}
        inAppBrowser={inAppBrowser}
        rival={rival}
      />
    </Suspense>
  )
}

function DeletedNotice() {
  const searchParams = useSearchParams()
  if (searchParams.get('deleted') !== '1') return null
  return (
    <div
      role="status"
      className="pa-auth__alt glass rv-rise flex items-start justify-start gap-3 text-left text-sm"
    >
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-portal-green" aria-hidden />
      <div>
        <p className="font-semibold text-portal-ink">Tu cuenta fue eliminada</p>
        <p className="mt-0.5 text-portal-muted">
          Lamentamos verte partir. Podés volver cuando quieras.
        </p>
      </div>
    </div>
  )
}

/** Mismo botón de Google en el formulario y en el "enviado": una sola definición. */
function GoogleForm({
  googleAction,
  next,
}: {
  googleAction: StartGoogleLoginFromIngresar
  next: string
}) {
  return (
    <form action={googleAction}>
      <input type="hidden" name="next" value={next} />
      <SubmitButton {...GOOGLE_BUTTON} pendingLabel="Abriendo Google…">
        <GoogleIcon className="size-5" />
        Continuar con Google
      </SubmitButton>
    </form>
  )
}

function FormCard({
  action,
  googleAction,
  inAppBrowser,
  rival,
}: {
  action: PlayerLoginAction
  googleAction: StartGoogleLoginFromIngresar
  inAppBrowser: boolean
  rival?: RivalIngreso
}) {
  const [state, formAction] = useActionState(
    (prev: LoginState, formData: FormData) => callLogin(action, prev, formData),
    initial,
  )
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/mis-reservas'
  // "Usar otro email": useActionState no se puede reiniciar, así que se descarta ese envío.
  const [discarded, setDiscarded] = useState<LoginState | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  // Al volver al formulario el foco va al campo, con el email anterior seleccionado.
  useEffect(() => {
    if (!discarded) return
    emailRef.current?.focus()
    emailRef.current?.select()
  }, [discarded])

  if (state.status === 'sent' && state !== discarded) {
    return (
      <SentPanel
        email={state.email}
        sentAt={state.at}
        next={next}
        action={action}
        googleAction={googleAction}
        inAppBrowser={inAppBrowser}
        rival={rival}
        onChangeEmail={() => setDiscarded(state)}
      />
    )
  }

  const error = errorOf(state)

  const emailForm = (
    <form action={formAction} className="grid gap-3" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-1.5">
        <Label htmlFor="email" className="text-sm font-semibold text-portal-ink">
          Email
        </Label>
        <Input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="vos@email.com"
          defaultValue={state.status === 'idle' ? undefined : state.email}
          aria-invalid={state.status === 'error' ? 'true' : undefined}
          aria-describedby={error ? 'email-error email-help' : 'email-help'}
          className={GLASS_INPUT}
        />
        {error && (
          <p id="email-error" role="alert" className="rv-err">
            {error}
          </p>
        )}
        <p id="email-help" className="rv-small">
          Sin contraseña: te mandamos un enlace para entrar.
        </p>
      </div>
      <SubmitButton
        variant="pill"
        size="pill"
        className="rv-go w-full disabled:opacity-100"
        pendingLabel="Enviando…"
      >
        Mandame el enlace
      </SubmitButton>
    </form>
  )

  const divider = (
    <div aria-hidden className="rv-or">
      o
    </div>
  )

  return (
    <>
      <div className="rv-rise">
        <h1 className="pa-auth__title">{rival ? RIVAL_TITLE[rival].h1 : 'Accedé a tu cuenta'}</h1>
        <p className="pa-auth__lead">
          {rival
            ? RIVAL_TITLE[rival].sub
            : 'Entrá para ver tus reservas y reservar sin cargar tus datos cada vez.'}
        </p>
      </div>
      <section
        aria-label="Ingresar"
        className="pa-auth__card glass rv-rise"
        style={{ '--i': 1 } as CSSProperties}
      >
        {inAppBrowser ? (
          <>
            {emailForm}
            {divider}
            <InAppBrowserNotice glass />
          </>
        ) : (
          <>
            <GoogleForm googleAction={googleAction} next={next} />
            {divider}
            {emailForm}
          </>
        )}
        {/* Acá y no en page.tsx: en el "enviado" ese lugar lo ocupa el bloque de primera vez. */}
        <p className="rv-small mt-3">
          {rival ? (
            <>
              ¿Primera vez? Entrá con Google, o{' '}
              <Link href="/rival/nuevo" className={exploreLinkClass}>
                armá tu primer partido
              </Link>{' '}
              y la cuenta se crea sola.
            </>
          ) : (
            <>
              ¿Primera vez en TurnoGol?{' '}
              <Link href="/explorar" className={exploreLinkClass}>
                Descubrí complejos y reservá tu cancha
              </Link>
            </>
          )}
        </p>
      </section>
      <ComplejoLinks />
    </>
  )
}

function SentPanel({
  email,
  sentAt,
  next,
  action,
  googleAction,
  inAppBrowser,
  rival,
  onChangeEmail,
}: {
  email: string
  sentAt: number
  next: string
  action: PlayerLoginAction
  googleAction: StartGoogleLoginFromIngresar
  inAppBrowser: boolean
  rival?: RivalIngreso
  onChangeEmail: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  // El formulario (y el botón que tenía el foco) desaparece: el foco pasa al título.
  useEffect(() => {
    heading.current?.focus()
  }, [])

  return (
    <div className="rv-swap grid w-full justify-items-center gap-5">
      <span className="rv-badge rv-tap mb-0">
        <Mail aria-hidden />
      </span>
      <div>
        <h1 ref={heading} tabIndex={-1} className="pa-auth__title outline-hidden">
          Revisá tu email
        </h1>
        {/* La action contesta "sent" aunque ese email no tenga cuenta (no revela quién tiene): el
            texto no afirma que el mail salió. */}
        <p className="pa-auth__lead break-words">
          Si <strong className="font-semibold text-portal-ink">{email}</strong> tiene cuenta, te
          enviamos un enlace para entrar.
        </p>
      </div>
      <section aria-label="Si no llegó" className="pa-auth__card glass">
        <p className="rv-small">
          ¿No llegó? Revisá la carpeta de correo no deseado o que el email esté bien escrito.
        </p>
        <div className="flex flex-wrap items-start gap-2">
          <ResendLinkForm
            action={action}
            fields={{ email, next }}
            sentAt={sentAt}
            scope="ingresar"
            button={GHOST_BUTTON}
            resentNotice="Listo: si ese email tiene cuenta, te llega otro enlace. Usá el del último correo."
          />
          <Button type="button" {...GHOST_BUTTON} onClick={onChangeEmail}>
            Usar otro email
          </Button>
        </div>
        {/* Para el que entra por primera vez: sin cuenta no hay mail, y acá se lo dice. */}
        <div className="grid gap-4 border-t border-portal-inner-line pt-3.5">
          <p className="rv-small">
            {inAppBrowser ? (
              <>
                ¿Primera vez?{' '}
                <Link href={rival ? '/rival/nuevo' : '/explorar'} className={exploreLinkClass}>
                  {rival ? 'Armá tu primer partido' : 'Reservá tu primer turno'}
                </Link>{' '}
                y la cuenta se crea sola.
              </>
            ) : (
              <>
                ¿Primera vez? Entrá con Google o{' '}
                <Link href={rival ? '/rival/nuevo' : '/explorar'} className={exploreLinkClass}>
                  {rival ? 'armá tu primer partido' : 'reservá tu primer turno'}
                </Link>
                {rival ? ' y la cuenta se crea sola.' : ': la cuenta se crea sola.'}
              </>
            )}
          </p>
          {!inAppBrowser && <GoogleForm googleAction={googleAction} next={next} />}
        </div>
      </section>
      <ComplejoLinks />
    </div>
  )
}
