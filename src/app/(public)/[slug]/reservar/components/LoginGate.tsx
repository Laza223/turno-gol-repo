'use client'

import { useActionState, useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { GoogleIcon } from '@/components/icons/GoogleIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  MAIL_ERROR_CLASS,
  ResendLinkForm,
  callMailAction,
  type MailState,
} from '@/components/world/MagicLinkSent'
import {
  PORTAL_BUTTON,
  PORTAL_BUTTON_OUTLINE,
  PORTAL_INPUT,
  PORTAL_LINK,
  PORTAL_SECTION_TITLE,
} from '@/components/world/PortalAuthFrame'
import { echoFields } from '@/shared/forms/echo'
import { TERMS_REQUIRED_MESSAGE } from '@/shared/terms'
import { cn } from '@/lib/utils'
import type { GateState, sendPlayerMagicLink } from '../actions'

/** Firma de las Server Actions que consume el gate (ver ../actions). */
export type SendPlayerMagicLink = typeof sendPlayerMagicLink
/**
 * Lo que el gate le pide a la action de Google: `(prev, formData)`. La action real acepta además la
 * firma de antes del deploy, `(formData)`, y por eso su tipo es más ancho que este.
 */
export type StartGoogleLoginFromReservar = (
  prev: GateState,
  formData: FormData,
) => Promise<GateState>

/** Lo tipeado que se conserva si la request no llegó (los errores del servidor ya lo traen). */
type GateEcho = { values: { email?: string; firstName?: string } }
/** `n`: cuál fue la última respuesta entre las dos actions (un corte no mueve el reloj `at`). */
type State = MailState<GateState, GateEcho> & { n: number }

const initial: State = { status: 'idle', at: 0, n: 0 }
const echo = (fd: FormData): GateEcho => ({
  values: echoFields(fd, ['email', 'firstName'] as const),
})

const GOOGLE_OFFLINE_MESSAGE = 'No pudimos abrir Google. Revisá tu conexión y probá de nuevo.'

const linkClass = cn(
  PORTAL_LINK,
  'font-semibold text-emerald-700 underline underline-offset-4 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300',
)

/**
 * El ingreso de la pantalla de confirmar (sin sesión): la declaración de +18 (ADR-012), Google y el
 * email, uno debajo del otro y del mismo alto; el verde, uno solo, en el envío del email. Dos
 * formularios porque son dos actions, y la casilla es de los dos: vive afuera, controlada, y viaja
 * en un campo oculto `terms` de cada uno. Nada se deshabilita por la casilla: si falta, el error
 * sale EN la casilla y el foco va a ella (lo mismo con nombre y email). Google ataja la casilla
 * sin tildar en el cliente, sin vuelta al servidor; el servidor la exige igual. Las actions entran
 * por PROP (ver CheckoutFlow).
 *
 * `inAppBrowser` lo resuelve el servidor (page.tsx) con el User-Agent: en el navegador interno de
 * Instagram, Facebook o TikTok va primero el email, porque Google puede no abrir.
 *
 * `withDeposit` decide qué se promete: sin seña, entrar deja la reserva confirmada (vuelve del
 * ingreso con la reserva hecha); con seña vuelve a esta pantalla y el jugador paga. Requerido a
 * propósito: un olvido prometería una confirmación que un complejo con seña no da.
 */
export default function LoginGate({
  next,
  action,
  googleAction,
  inAppBrowser = false,
  withDeposit,
}: {
  next: string
  action: SendPlayerMagicLink
  googleAction: StartGoogleLoginFromReservar
  inAppBrowser?: boolean
  withDeposit: boolean
}) {
  const calls = useRef(0)
  const run =
    (
      send: (prev: GateState, formData: FormData) => Promise<GateState>,
      options: { echo?: typeof echo; offlineMessage?: string },
    ) =>
    async (prev: State, formData: FormData): Promise<State> => {
      const n = ++calls.current
      return {
        ...(await callMailAction(send, prev, formData, { scope: 'reservar', ...options })),
        n,
      }
    }
  const [emailState, emailDispatch] = useActionState<State, FormData>(
    run(action, { echo }),
    initial,
  )
  // Google no echa lo tipeado (su formulario no lo tiene) y un corte de red dice lo de Google.
  const [googleState, googleDispatch] = useActionState<State, FormData>(
    run(googleAction, { offlineMessage: GOOGLE_OFFLINE_MESSAGE }),
    initial,
  )
  // Google sin la casilla: la falta se ataja acá, antes de salir, y cuenta como una respuesta más.
  const [blocked, setBlocked] = useState<State | null>(null)
  // La respuesta más reciente manda para el error y el foco; los valores del formulario del
  // email, en cambio, salen SOLO de lo que contestó el email (ver `values`).
  const state = [googleState, blocked].reduce<State>(
    (latest, s) => (s && s.n > latest.n ? s : latest),
    emailState,
  )
  const [terms, setTerms] = useState(false)
  // "Usar otro email": useActionState no se puede reiniciar, así que se descarta ese envío.
  const [discarded, setDiscarded] = useState<State | null>(null)
  const termsRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  // El foco va al primer campo inválido (cada respuesta es un estado nuevo, aunque sea el mismo campo).
  useEffect(() => {
    if (state.status !== 'error' || !state.field) return
    ;({ terms: termsRef, firstName: nameRef, email: emailRef })[state.field].current?.focus()
  }, [state])

  // Al volver al formulario el foco va al email, seleccionado.
  useEffect(() => {
    if (!discarded) return
    emailRef.current?.focus()
    emailRef.current?.select()
  }, [discarded])

  if (emailState.status === 'sent' && emailState !== discarded) {
    return (
      <SentPanel
        email={emailState.email}
        firstName={emailState.firstName}
        sentAt={emailState.at}
        next={next}
        withDeposit={withDeposit}
        action={action}
        onChangeEmail={() => setDiscarded(emailState)}
      />
    )
  }

  // Una respuesta de Google no puede vaciar Nombre y Email: al cambiar el `defaultValue` React
  // vacía los campos que el jugador no tocó desde que se limpió el formulario.
  const values =
    emailState.status === 'sent'
      ? { email: emailState.email, firstName: emailState.firstName }
      : emailState.status === 'error' || emailState.status === 'unreached'
        ? (emailState.values ?? {})
        : {}
  const fieldError = (field: 'terms' | 'firstName' | 'email') =>
    // Con la casilla ya tildada, el error de la casilla es de un intento anterior.
    state.status === 'error' && state.field === field && !(field === 'terms' && terms)
      ? state.message
      : null
  const termsError = fieldError('terms')
  const nameError = fieldError('firstName')
  const emailError = fieldError('email')
  // El error que no es de un campo va junto al botón que lo causó.
  const sendError =
    state.status === 'unreached' || (state.status === 'error' && !state.field)
      ? state.message
      : null
  const googleSendError = state === googleState ? sendError : null
  const emailSendError = state === googleState ? null : sendError

  // Google sin la casilla tildada: error y foco al instante; el servidor la exige igual.
  const blockGoogleWithoutTerms = (event: FormEvent<HTMLFormElement>) => {
    if (terms) return
    event.preventDefault()
    setBlocked({
      status: 'error',
      message: TERMS_REQUIRED_MESSAGE,
      field: 'terms',
      at: 0,
      n: ++calls.current,
    })
  }

  const hidden = (
    <>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="terms" value={terms ? 'on' : ''} />
    </>
  )

  const emailForm = (
    <form action={emailDispatch} className="space-y-4" noValidate>
      {hidden}
      <div className="space-y-2">
        <Label htmlFor="gate-first-name" className="text-base">
          Nombre
        </Label>
        <Input
          ref={nameRef}
          id="gate-first-name"
          name="firstName"
          autoComplete="given-name"
          maxLength={80}
          required
          defaultValue={values.firstName}
          aria-invalid={nameError ? 'true' : undefined}
          aria-describedby={nameError ? 'gate-first-name-error' : undefined}
          className={PORTAL_INPUT}
        />
        {nameError && (
          <p id="gate-first-name-error" role="alert" className={MAIL_ERROR_CLASS}>
            {nameError}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="gate-email" className="text-base">
          Email
        </Label>
        <Input
          ref={emailRef}
          id="gate-email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="vos@email.com"
          defaultValue={values.email}
          aria-invalid={emailError ? 'true' : undefined}
          aria-describedby={emailError ? 'gate-email-error' : undefined}
          className={PORTAL_INPUT}
        />
        {emailError && (
          <p id="gate-email-error" role="alert" className={MAIL_ERROR_CLASS}>
            {emailError}
          </p>
        )}
      </div>
      {emailSendError && (
        <p role="alert" className={MAIL_ERROR_CLASS}>
          {emailSendError}
        </p>
      )}
      <SubmitButton className={PORTAL_BUTTON} pendingLabel="Enviando…">
        Continuar con mi email
      </SubmitButton>
    </form>
  )

  const googleBlock = (
    <div className="space-y-3">
      <form action={googleDispatch} onSubmit={blockGoogleWithoutTerms}>
        {hidden}
        <SubmitButton
          variant="outline"
          className={PORTAL_BUTTON_OUTLINE}
          pendingLabel="Abriendo Google…"
        >
          <GoogleIcon className="mr-2 size-5" />
          Continuar con Google
        </SubmitButton>
      </form>
      {googleSendError && (
        <p role="alert" className={MAIL_ERROR_CLASS}>
          {googleSendError}
        </p>
      )}
      {inAppBrowser && (
        <p className="text-pretty text-sm text-muted-foreground">
          Google puede no abrirse desde este navegador. Con tu email entrás igual.
        </p>
      )}
    </div>
  )

  const divider = (
    <div aria-hidden className="flex items-center gap-3 text-sm text-muted-foreground">
      <div className="h-px flex-1 bg-border" />o<div className="h-px flex-1 bg-border" />
    </div>
  )

  return (
    <section aria-labelledby="gate-title" className="space-y-6">
      <div>
        <h2 id="gate-title" className={cn(PORTAL_SECTION_TITLE, 'mb-3')}>
          Entrá para reservar
        </h2>
        <label className="flex min-h-12 cursor-pointer items-start gap-3">
          <span className="relative mt-0.5 size-6 shrink-0">
            <input
              ref={termsRef}
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              aria-invalid={termsError ? 'true' : undefined}
              aria-describedby={termsError ? 'gate-terms-error' : undefined}
              className="peer size-6 cursor-pointer appearance-none rounded-[6px] border-2 border-input bg-background transition-colors checked:border-primary checked:bg-primary aria-invalid:border-destructive focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
            <Check
              aria-hidden
              strokeWidth={3}
              className="pointer-events-none absolute inset-0 m-auto size-4 text-primary-foreground opacity-0 peer-checked:opacity-100"
            />
          </span>
          <span className="text-base text-foreground">
            Soy mayor de 18 años y acepto los términos y condiciones de uso (declaración jurada).
          </span>
        </label>
        {termsError && (
          <p id="gate-terms-error" role="alert" className={cn('mt-1 ml-9', MAIL_ERROR_CLASS)}>
            {termsError}
          </p>
        )}
        {/* Fuera del rótulo: adentro, tocar cerca del link navegaba en vez de tildar la casilla. En
            otra pestaña, para no perder lo que se tipeó. Alineado con el texto del rótulo (casilla
            de 24 px + hueco de 12 px) y de 44 px de alto. */}
        <Link
          href="/terminos"
          target="_blank"
          rel="noopener noreferrer"
          className={cn('ml-9 flex min-h-11 w-fit items-center text-sm', linkClass)}
        >
          Leer los términos y condiciones
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </Link>
      </div>
      {!withDeposit && (
        <p className="text-pretty text-base text-muted-foreground">
          Entrás y la reserva queda confirmada.
        </p>
      )}
      {inAppBrowser ? (
        <>
          {emailForm}
          {divider}
          {googleBlock}
        </>
      ) : (
        <>
          {googleBlock}
          {divider}
          {emailForm}
        </>
      )}
    </section>
  )
}

/**
 * "Enviado": el foco pasa al título (el formulario, y el botón que lo tenía, desaparecieron). Dice
 * la verdad de hoy: sin seña, tocar el enlace deja la reserva confirmada; con seña trae de vuelta
 * a esta pantalla con la cuenta, y ahí se paga. A diferencia de /ingresar, acá la action SÍ crea
 * la cuenta, así que no hay "si tiene cuenta".
 */
function SentPanel({
  email,
  firstName,
  sentAt,
  next,
  withDeposit,
  action,
  onChangeEmail,
}: {
  email: string
  firstName: string
  sentAt: number
  next: string
  withDeposit: boolean
  action: SendPlayerMagicLink
  onChangeEmail: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])

  return (
    <section aria-labelledby="gate-sent-title">
      <h2
        id="gate-sent-title"
        ref={heading}
        tabIndex={-1}
        className={cn(PORTAL_SECTION_TITLE, 'outline-hidden')}
      >
        Revisá tu email
      </h2>
      <p className="mt-3 break-words text-base text-foreground">
        Te mandamos un enlace a <strong className="font-semibold">{email}</strong>.
      </p>
      <p className="mt-2 text-pretty text-base text-muted-foreground">
        {withDeposit
          ? 'Cuando lo toques, volvés a esta pantalla con tu cuenta y ahí pagás la seña.'
          : 'Cuando lo toques, tu reserva queda confirmada.'}
      </p>
      <p className="mt-2 text-pretty text-sm text-muted-foreground">
        ¿No llegó? Revisá la carpeta de correo no deseado o que el email esté bien escrito.
      </p>
      <div className="mt-6 space-y-3">
        <ResendLinkForm
          action={action}
          fields={{ email, firstName, next, terms: 'on' }}
          sentAt={sentAt}
          scope="reservar"
          resentNotice="Listo: te mandamos otro enlace. Usá el del último correo."
        />
        <Button type="button" variant="ghost" className={PORTAL_BUTTON} onClick={onChangeEmail}>
          Usar otro email
        </Button>
      </div>
    </section>
  )
}
