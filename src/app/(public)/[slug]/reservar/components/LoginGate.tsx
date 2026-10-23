'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { GoogleIcon } from '@/components/icons/GoogleIcon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import { InAppBrowserNotice } from '@/components/world/InAppBrowserNotice'
import {
  MAIL_ERROR_CLASS,
  ResendLinkForm,
  callMailAction,
  type MailState,
} from '@/components/world/MagicLinkSent'
import {
  AUTH_ACCENT_STYLE,
  AUTH_CARD_STYLE,
  AUTH_INPUT,
  AUTH_TITLE,
  PORTAL_BUTTON,
  PORTAL_BUTTON_OUTLINE,
  PORTAL_LINK,
} from '@/components/world/PortalAuthFrame'
import { echoFields } from '@/shared/forms/echo'
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

/**
 * `reservar` (default): el ingreso de la pantalla de confirmar, donde `withDeposit` es obligatorio.
 * `rival`: el "Voy" de un partido de RIVAL; no hay seña, entrar devuelve al mismo partido.
 */
type GateVariant =
  { variant?: 'reservar'; withDeposit: boolean } | { variant: 'rival'; withDeposit?: never }

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
  'font-semibold text-emerald-400 underline underline-offset-4 hover:text-emerald-300',
)

/**
 * El modal de ingreso en La Previa: siempre oscuro (`dark` + `dark-surface` resuelven los tokens en
 * oscuro con cualquier tema, y el `--input` de campo llega a 3:1 sobre el vidrio). En el celular es
 * una hoja que sube desde abajo y desde `md` una tarjeta centrada; el panel scrollea si el teclado
 * le come el alto. La X de cierre del primitivo se agranda a 44 px.
 */
const GATE_CONTENT = cn(
  'dark dark-surface text-foreground [--input:215.4_16.3%_50%]',
  'top-auto bottom-0 left-0 max-h-[92dvh] w-full max-w-none translate-x-0 rounded-b-none rounded-t-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]',
  'md:top-1/2 md:bottom-auto md:left-1/2 md:max-h-[90dvh] md:w-[calc(100%-2rem)] md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:p-8',
  'data-[state=open]:slide-in-from-left-0 data-[state=closed]:slide-out-to-left-0 data-[state=open]:slide-in-from-bottom-10 data-[state=closed]:slide-out-to-bottom-10',
  'md:data-[state=open]:slide-in-from-left-1/2 md:data-[state=closed]:slide-out-to-left-1/2 md:data-[state=open]:slide-in-from-bottom-0 md:data-[state=closed]:slide-out-to-bottom-0',
  '[&>button]:right-3 [&>button]:top-3 [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center [&>button]:p-0 [&>button]:text-white [&>button]:opacity-100',
)

/**
 * El vidrio de La Previa pero opaco: el velo del Dialog es `bg-black/50` con tema claro y la
 * página clara se transparentaba, el borde de los campos bajaba a 2,6:1. Opaco, lo más claro
 * detrás del contenido es slate-900, que es contra lo que miden las stories (`onGlass`).
 */
const GATE_CARD_STYLE = {
  ...AUTH_CARD_STYLE,
  background: 'linear-gradient(180deg, #0f172a, #020617)',
} as const

/**
 * El ingreso de la pantalla de confirmar (sin sesión), en un modal que abre el botón de la
 * pantalla: Google y el email, uno debajo del otro y del mismo alto; el verde, uno solo, en el
 * envío del email. Dos formularios porque son dos actions. No hay casilla de +18: tocar Google o
 * "Continuar con mi email" ES la aceptación (clickwrap, decisión del dueño 2026-10-21) y los dos
 * forms mandan `terms=on` en un campo oculto; el servidor lo exige igual y graba el consentimiento
 * como siempre. El nombre sale del email en el servidor. Las actions entran por PROP (ver
 * CheckoutFlow).
 *
 * El estado de los envíos vive AFUERA del contenido del modal: si el jugador lo cierra después de
 * pedir el enlace y lo vuelve a abrir, sigue viendo "Revisá tu email".
 *
 * `inAppBrowser` lo resuelve el servidor (page.tsx) con el User-Agent: en el navegador interno de
 * Instagram, Facebook o TikTok va primero el email y, en lugar de Google, `InAppBrowserNotice`.
 *
 * `withDeposit` decide qué se promete: sin seña, entrar deja la reserva confirmada (vuelve del
 * ingreso con la reserva hecha); con seña vuelve a esta pantalla y el jugador paga. Requerido a
 * propósito: un olvido prometería una confirmación que un complejo con seña no da.
 */
export default function LoginGate({
  open,
  onOpenChange,
  next,
  action,
  googleAction,
  inAppBrowser = false,
  withDeposit = false,
  variant = 'reservar',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  next: string
  action: SendPlayerMagicLink
  googleAction: StartGoogleLoginFromReservar
  inAppBrowser?: boolean
} & GateVariant) {
  const rival = variant === 'rival'
  const scope = rival ? 'rival' : 'reservar'
  const calls = useRef(0)
  const run =
    (
      send: (prev: GateState, formData: FormData) => Promise<GateState>,
      options: { echo?: typeof echo; offlineMessage?: string },
    ) =>
    async (prev: State, formData: FormData): Promise<State> => {
      const n = ++calls.current
      return {
        ...(await callMailAction(send, prev, formData, { scope, ...options })),
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
  // La respuesta más reciente manda para el error y el foco; el valor del formulario del
  // email, en cambio, sale SOLO de lo que contestó el email (ver `values`).
  const state = googleState.n > emailState.n ? googleState : emailState
  // "Usar otro email": useActionState no se puede reiniciar, así que se descarta ese envío.
  const [discarded, setDiscarded] = useState<State | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  // El foco va al email cuando es el campo inválido (cada respuesta es un estado nuevo).
  useEffect(() => {
    if (state.status === 'error' && state.field === 'email') emailRef.current?.focus()
  }, [state])

  // Al volver al formulario el foco va al email, seleccionado.
  useEffect(() => {
    if (!discarded) return
    emailRef.current?.focus()
    emailRef.current?.select()
  }, [discarded])

  // Una respuesta de Google no puede vaciar el Email: al cambiar el `defaultValue` React vacía los
  // campos que el jugador no tocó desde que se limpió el formulario.
  const values =
    emailState.status === 'sent'
      ? { email: emailState.email }
      : emailState.status === 'error' || emailState.status === 'unreached'
        ? (emailState.values ?? {})
        : {}
  const emailError = state.status === 'error' && state.field === 'email' ? state.message : null
  // El error que no es del campo del email va junto al botón que lo causó.
  const sendError =
    state.status === 'unreached' || (state.status === 'error' && state.field !== 'email')
      ? state.message
      : null
  const googleSendError = state === googleState ? sendError : null
  const emailSendError = state === googleState ? null : sendError

  const hidden = (
    <>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="terms" value="on" />
    </>
  )

  const emailForm = (
    <form action={emailDispatch} className="space-y-4" noValidate>
      {hidden}
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
          className={AUTH_INPUT}
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
      <form action={googleDispatch}>
        {hidden}
        <SubmitButton
          variant="outline"
          className={cn(PORTAL_BUTTON_OUTLINE, 'bg-white/4')}
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
    </div>
  )

  const divider = (
    <div aria-hidden className="flex items-center gap-3 text-sm text-muted-foreground">
      <div className="h-px flex-1 bg-border" />o<div className="h-px flex-1 bg-border" />
    </div>
  )

  const sentMessage = rival
    ? 'Cuando lo toques, volvés a este partido con tu cuenta.'
    : withDeposit
      ? 'Cuando lo toques, volvés a esta pantalla con tu cuenta y ahí pagás la seña.'
      : 'Cuando lo toques, tu reserva queda confirmada.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={GATE_CONTENT} style={GATE_CARD_STYLE}>
        {emailState.status === 'sent' && emailState !== discarded ? (
          <SentPanel
            email={emailState.email}
            firstName={emailState.firstName}
            sentAt={emailState.at}
            next={next}
            sentMessage={sentMessage}
            scope={scope}
            action={action}
            onChangeEmail={() => setDiscarded(emailState)}
          />
        ) : (
          <div className="space-y-6">
            <div>
              {/* `pr-6`: deja libre el lugar de la X del diálogo (el título RIVAL llega hasta ahí a 390 px). */}
              <DialogTitle className={cn(AUTH_TITLE, 'pr-6')}>
                {rival ? (
                  <>
                    Entrá para <span style={AUTH_ACCENT_STYLE}>sumarte</span> al partido
                  </>
                ) : (
                  <>
                    Entrá para <span style={AUTH_ACCENT_STYLE}>reservar</span>
                  </>
                )}
              </DialogTitle>
              {rival ? (
                <p className="mt-2 text-pretty text-base text-muted-foreground">
                  Entrás y volvés a este partido.
                </p>
              ) : (
                !withDeposit && (
                  <p className="mt-2 text-pretty text-base text-muted-foreground">
                    Entrás y la reserva queda confirmada.
                  </p>
                )
              )}
            </div>
            {inAppBrowser ? (
              <>
                {emailForm}
                {divider}
                <InAppBrowserNotice />
              </>
            ) : (
              <>
                {googleBlock}
                {divider}
                {emailForm}
              </>
            )}
            {/* Clickwrap: tocar uno de los dos botones de arriba es aceptar. El link va en otra
                pestaña, para no perder lo que se tipeó, y con 44 px de alto táctil. */}
            <p className="text-pretty text-sm text-muted-foreground">
              Al continuar declarás que sos mayor de 18 años y aceptás los{' '}
              <Link
                href="/terminos"
                target="_blank"
                rel="noopener noreferrer"
                className={cn('inline-flex min-h-11 items-center', linkClass)}
              >
                Términos y condiciones
                <span className="sr-only"> (se abre en otra pestaña)</span>
              </Link>
              .
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
  sentMessage,
  scope,
  action,
  onChangeEmail,
}: {
  email: string
  firstName: string
  sentAt: number
  next: string
  sentMessage: string
  scope: string
  action: SendPlayerMagicLink
  onChangeEmail: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])

  return (
    <div>
      <DialogTitle ref={heading} tabIndex={-1} className={cn(AUTH_TITLE, 'outline-hidden')}>
        Revisá tu <span style={AUTH_ACCENT_STYLE}>email</span>
      </DialogTitle>
      <p className="mt-3 break-words text-base text-foreground">
        Te mandamos un enlace a <strong className="font-semibold">{email}</strong>.
      </p>
      <p className="mt-2 text-pretty text-base text-muted-foreground">{sentMessage}</p>
      <p className="mt-2 text-pretty text-sm text-muted-foreground">
        ¿No llegó? Revisá la carpeta de correo no deseado o que el email esté bien escrito.
      </p>
      <div className="mt-6 space-y-3">
        <ResendLinkForm
          action={action}
          fields={{ email, firstName, next, terms: 'on' }}
          sentAt={sentAt}
          scope={scope}
          resentNotice="Listo: te mandamos otro enlace. Usá el del último correo."
        />
        <Button type="button" variant="ghost" className={PORTAL_BUTTON} onClick={onChangeEmail}>
          Usar otro email
        </Button>
      </div>
    </div>
  )
}
