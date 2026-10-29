'use client'

import { Suspense, useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import { GoogleIcon } from '@/components/icons/GoogleIcon'
import { InAppBrowserNotice } from '@/components/world/InAppBrowserNotice'
import {
  AUTH_ACCENT_STYLE,
  AUTH_INPUT,
  AUTH_TITLE,
  PORTAL_BUTTON,
  PORTAL_BUTTON_OUTLINE,
} from '@/components/world/PortalAuthFrame'
import {
  MAIL_ERROR_CLASS,
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
const exploreLinkClass =
  'py-3.5 font-semibold text-emerald-700 underline underline-offset-4 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300'

/**
 * Puerta del complejo: /ingresar es el login del JUGADOR, y desde el celu la barra no trae "Para
 * complejos". Sin esto el dueño, con cuenta o sin ella, no tenía cómo llegar a /login ni a /register.
 * Va en el formulario y en el "enviado" (quien tipeó el mail del complejo espera un enlace que no
 * llega). Links planos y no `IngresarLink`: el destino no es /ingresar. Cada uno mide 44 px.
 */
function ComplejoLinks() {
  const linkClass =
    'inline-flex min-h-11 items-center font-semibold text-emerald-700 underline underline-offset-4 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300'
  return (
    <div className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
      <p>¿Tenés un complejo?</p>
      <div className="flex flex-wrap items-center gap-x-5">
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
}: {
  action: PlayerLoginAction
  googleAction: StartGoogleLoginFromIngresar
  inAppBrowser?: boolean
}) {
  return (
    <Suspense fallback={null}>
      <DeletedNotice />
      <FormCard action={action} googleAction={googleAction} inAppBrowser={inAppBrowser} />
    </Suspense>
  )
}

function DeletedNotice() {
  const searchParams = useSearchParams()
  if (searchParams.get('deleted') !== '1') return null
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm"
    >
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" aria-hidden />
      <div>
        <p className="font-semibold text-emerald-200">Tu cuenta fue eliminada</p>
        <p className="mt-0.5 text-emerald-100/80">
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
      <SubmitButton
        variant="outline"
        className={PORTAL_BUTTON_OUTLINE}
        pendingLabel="Abriendo Google…"
      >
        <GoogleIcon className="mr-2 size-5" />
        Continuar con Google
      </SubmitButton>
    </form>
  )
}

function FormCard({
  action,
  googleAction,
  inAppBrowser,
}: {
  action: PlayerLoginAction
  googleAction: StartGoogleLoginFromIngresar
  inAppBrowser: boolean
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
        onChangeEmail={() => setDiscarded(state)}
      />
    )
  }

  const error = errorOf(state)

  const emailForm = (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="email" className="text-base">
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
          className={AUTH_INPUT}
        />
        {error && (
          <p id="email-error" role="alert" className={MAIL_ERROR_CLASS}>
            {error}
          </p>
        )}
        <p id="email-help" className="text-sm text-muted-foreground">
          Sin contraseña: te mandamos un enlace para entrar.
        </p>
      </div>
      <SubmitButton className={PORTAL_BUTTON} pendingLabel="Enviando…">
        Mandame el enlace
      </SubmitButton>
    </form>
  )

  const divider = (
    <div aria-hidden className="flex items-center gap-3 text-sm text-muted-foreground">
      <div className="h-px flex-1 bg-border" />o<div className="h-px flex-1 bg-border" />
    </div>
  )

  return (
    <>
      <div>
        <h1 className={AUTH_TITLE}>
          Accedé a tu <span style={AUTH_ACCENT_STYLE}>cuenta</span>
        </h1>
        <p className="mt-2 text-pretty text-base text-muted-foreground">
          Entrá para ver tus reservas y reservar sin cargar tus datos cada vez.
        </p>
      </div>
      <div className="mt-8 space-y-6">
        {inAppBrowser ? (
          <>
            {emailForm}
            {divider}
            <InAppBrowserNotice />
          </>
        ) : (
          <>
            <GoogleForm googleAction={googleAction} next={next} />
            {divider}
            {emailForm}
          </>
        )}
      </div>
      {/* Acá y no en page.tsx: en el "enviado" ese lugar lo ocupa el bloque de primera vez. */}
      <p className="mt-8 text-sm text-muted-foreground">
        ¿Primera vez en TurnoGol?{' '}
        <Link href="/explorar" className={exploreLinkClass}>
          Descubrí complejos y reservá tu cancha
        </Link>
      </p>
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
  onChangeEmail,
}: {
  email: string
  sentAt: number
  next: string
  action: PlayerLoginAction
  googleAction: StartGoogleLoginFromIngresar
  inAppBrowser: boolean
  onChangeEmail: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  // El formulario (y el botón que tenía el foco) desaparece: el foco pasa al título.
  useEffect(() => {
    heading.current?.focus()
  }, [])

  return (
    <>
      <h1 ref={heading} tabIndex={-1} className={cn(AUTH_TITLE, 'outline-hidden')}>
        Revisá tu email
      </h1>
      {/* La action contesta "sent" aunque ese email no tenga cuenta (no revela quién tiene): el
          texto no afirma que el mail salió. */}
      <p className="mt-2 break-words text-base text-muted-foreground">
        Si <strong className="font-semibold text-foreground">{email}</strong> tiene cuenta, te
        enviamos un enlace para entrar.
      </p>
      <p className="mt-2 text-pretty text-sm text-muted-foreground">
        ¿No llegó? Revisá la carpeta de correo no deseado o que el email esté bien escrito.
      </p>
      <div className="mt-8 space-y-3">
        <ResendLinkForm
          action={action}
          fields={{ email, next }}
          sentAt={sentAt}
          scope="ingresar"
          resentNotice="Listo: si ese email tiene cuenta, te llega otro enlace. Usá el del último correo."
        />
        <Button type="button" variant="ghost" className={PORTAL_BUTTON} onClick={onChangeEmail}>
          Usar otro email
        </Button>
      </div>
      {/* Para el que entra por primera vez: sin cuenta no hay mail, y acá se lo dice. El gap de
          14 px deja aire entre el área de toque del link (padding vertical) y el botón de Google. */}
      <div className="mt-10 space-y-3.5">
        <p className="text-pretty text-sm text-muted-foreground">
          {inAppBrowser ? (
            <>
              ¿Primera vez?{' '}
              <Link href="/explorar" className={exploreLinkClass}>
                Reservá tu primer turno
              </Link>{' '}
              y la cuenta se crea sola.
            </>
          ) : (
            <>
              ¿Primera vez? Entrá con Google o{' '}
              <Link href="/explorar" className={exploreLinkClass}>
                reservá tu primer turno
              </Link>
              : la cuenta se crea sola.
            </>
          )}
        </p>
        {!inAppBrowser && <GoogleForm googleAction={googleAction} next={next} />}
      </div>
      <ComplejoLinks />
    </>
  )
}
