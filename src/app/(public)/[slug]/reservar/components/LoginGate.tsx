'use client'

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react'
import Link from 'next/link'
import { Mail } from 'lucide-react'
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
  GLASS_INPUT,
  PORTAL_BUTTON,
  PORTAL_BUTTON_OUTLINE,
  PORTAL_LINK,
} from '@/components/world/portal-auth-styles'
import { echoFields } from '@/shared/forms/echo'
import { cn } from '@/lib/utils'
import type { GateState, sendPlayerMagicLink } from '../actions'
import '@/components/booking/reserva.css'

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

/** A qué entra quien pasa por el ingreso RIVAL: sumarse con "Voy", armar un partido, pedir sumarse o pedir jugar con su equipo. */
export type RivalGatePurpose = 'voy' | 'armar' | 'pedir' | 'pedir_equipo'

/**
 * `reservar` (default): el ingreso de la pantalla de confirmar, donde `withDeposit` es obligatorio.
 * `rival`: el ingreso de RIVAL; no hay seña, entrar devuelve a donde se estaba. `purpose` (default
 * `voy`) cambia el título y lo que promete: armar y pedir sumarse no se envían solos al volver.
 */
type GateVariant =
  | { variant?: 'reservar'; withDeposit: boolean; purpose?: never }
  | { variant: 'rival'; withDeposit?: never; purpose?: RivalGatePurpose }

const RIVAL_COPY: Record<
  RivalGatePurpose,
  { accent: string; after: string; lead: string; sent: string }
> = {
  voy: {
    accent: 'sumarte',
    after: ' al partido',
    lead: 'Entrás y volvés a este partido.',
    sent: 'Cuando lo toques, volvés a este partido con tu cuenta.',
  },
  armar: {
    accent: 'armar',
    after: ' tu partido',
    lead: 'Entrás con Google o con tu email. Si no tenés cuenta, se crea al toque. Después de entrar, armás tu partido.',
    sent: 'Cuando lo toques, entrás con tu cuenta y armás tu partido.',
  },
  pedir: {
    accent: 'pedir',
    after: ' tu lugar',
    lead: 'Entrás y volvés a este partido.',
    sent: 'Cuando lo toques, volvés a este partido con tu cuenta.',
  },
  pedir_equipo: {
    accent: 'pedir',
    after: ' jugar con tu equipo',
    lead: 'Entrás y volvés a este partido.',
    sent: 'Cuando lo toques, volvés a este partido con tu cuenta.',
  },
}

/** Lo tipeado que se conserva si la request no llegó (los errores del servidor ya lo traen). */
type GateEcho = { values: { email?: string; firstName?: string } }
/** `n`: cuál fue la última respuesta entre las dos actions (un corte no mueve el reloj `at`). */
type State = MailState<GateState, GateEcho> & { n: number }

const initial: State = { status: 'idle', at: 0, n: 0 }
const echo = (fd: FormData): GateEcho => ({
  values: echoFields(fd, ['email', 'firstName'] as const),
})

const GOOGLE_OFFLINE_MESSAGE = 'No pudimos abrir Google. Revisá tu conexión y probá de nuevo.'

/**
 * Las dos pieles del ingreso. `dialog`: el modal de La Previa que usa RIVAL. `glass`: el panel de
 * vidrio de la pantalla de confirmar (portal de vidrio F5, `reservar.html`).
 */
type Look = 'dialog' | 'glass'

const SKIN = {
  dialog: {
    input: AUTH_INPUT,
    go: { className: PORTAL_BUTTON },
    alt: { variant: 'outline', className: cn(PORTAL_BUTTON_OUTLINE, 'bg-white/4') },
    ghost: { variant: 'ghost', className: PORTAL_BUTTON },
    help: 'text-sm text-muted-foreground',
    lead: 'mt-2 text-pretty text-base text-muted-foreground',
    divider: 'flex items-center gap-3 text-sm text-muted-foreground',
    link: cn(
      PORTAL_LINK,
      'font-semibold text-emerald-400 underline underline-offset-4 hover:text-emerald-300',
    ),
    legal: 'text-pretty text-sm text-muted-foreground',
  },
  glass: {
    input: GLASS_INPUT,
    go: { variant: 'pill', size: 'pill', className: 'rv-go w-full' },
    alt: { variant: 'pill-glass', size: 'pill', className: 'w-full backdrop-filter-none' },
    ghost: { variant: 'pill-link', size: 'pill-sm' },
    help: 'rv-small',
    lead: 'rv-small mt-1.5',
    divider: 'rv-or',
    link: cn(PORTAL_LINK, 'rv-link'),
    legal: 'rv-small',
  },
} as const satisfies Record<
  Look,
  Record<
    'go' | 'alt' | 'ghost',
    Pick<ComponentProps<typeof SubmitButton>, 'variant' | 'size' | 'className'>
  > &
    Record<'input' | 'help' | 'lead' | 'divider' | 'link' | 'legal', string>
>

/**
 * El estado de los dos envíos (email y Google). Vive en quien lo llama y no en el contenido: en el
 * modal, si el jugador lo cierra después de pedir el enlace y lo vuelve a abrir, sigue viendo
 * "Revisá tu email".
 */
function useGate(
  action: SendPlayerMagicLink,
  googleAction: StartGoogleLoginFromReservar,
  scope: string,
) {
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
  // "Usar otro email": useActionState no se puede reiniciar, así que se descarta ese envío.
  const [discarded, setDiscarded] = useState<State | null>(null)
  // Editar el campo limpia el error de esa respuesta; la próxima respuesta es otro estado y vuelve a mostrarlo.
  const [editedAt, setEditedAt] = useState<State | null>(null)
  return {
    emailState,
    emailDispatch,
    googleState,
    googleDispatch,
    discarded,
    setDiscarded,
    editedAt,
    setEditedAt,
  }
}

type Gate = ReturnType<typeof useGate>

/** El título de cada piel: `DialogTitle` en el modal (nombra el diálogo) y un h2 en el panel. */
type TitleProps = {
  children: ReactNode
  className?: string
  tabIndex?: number
  ref?: Ref<HTMLHeadingElement>
  id?: string
}

/**
 * El cuerpo del ingreso, igual en las dos pieles: Google y el email, uno debajo del otro y del
 * mismo alto; el verde, uno solo, en el envío del email. Dos formularios porque son dos actions.
 * No hay casilla de +18: tocar Google o "Continuar con mi email" ES la aceptación (clickwrap,
 * decisión del dueño 2026-10-21) y los dos forms mandan `terms=on` en un campo oculto; el servidor
 * lo exige igual y graba el consentimiento como siempre. El nombre sale del email en el servidor.
 *
 * `inAppBrowser` lo resuelve el servidor (page.tsx) con el User-Agent: en el navegador interno de
 * Instagram, Facebook o TikTok va primero el email y, en lugar de Google, `InAppBrowserNotice`.
 *
 * `withDeposit` decide qué se promete: sin seña, entrar deja la reserva confirmada (vuelve del
 * ingreso con la reserva hecha); con seña vuelve a esta pantalla y el jugador paga.
 */
function GateBody({
  gate,
  look,
  Title,
  titleId,
  next,
  action,
  inAppBrowser,
  withDeposit,
  rival,
  purpose,
}: {
  gate: Gate
  look: Look
  Title: (props: TitleProps) => ReactNode
  titleId?: string
  next: string
  action: SendPlayerMagicLink
  inAppBrowser: boolean
  withDeposit: boolean
  rival: boolean
  purpose: RivalGatePurpose
}) {
  const skin = SKIN[look]
  const glass = look === 'glass'
  const rivalCopy = RIVAL_COPY[purpose]
  const scope = rival ? 'rival' : 'reservar'
  const {
    emailState,
    emailDispatch,
    googleState,
    googleDispatch,
    discarded,
    setDiscarded,
    editedAt,
    setEditedAt,
  } = gate
  // La respuesta más reciente manda para el error y el foco; el valor del formulario del
  // email, en cambio, sale SOLO de lo que contestó el email (ver `values`).
  const state = googleState.n > emailState.n ? googleState : emailState
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
  const emailError =
    state.status === 'error' && state.field === 'email' && editedAt !== state ? state.message : null
  // El error que no es del campo del email va junto al botón que lo causó.
  const sendError =
    state.status === 'unreached' || (state.status === 'error' && state.field !== 'email')
      ? state.message
      : null
  const googleSendError = state === googleState ? sendError : null
  const emailSendError = state === googleState ? null : sendError
  const errorClass = glass ? 'rv-err' : MAIL_ERROR_CLASS

  const hidden = (
    <>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="terms" value="on" />
    </>
  )

  if (emailState.status === 'sent' && emailState !== discarded) {
    const sentMessage = rival
      ? rivalCopy.sent
      : withDeposit
        ? 'Cuando lo toques, volvés a esta pantalla con tu cuenta y ahí pagás la seña.'
        : 'Cuando lo toques, tu reserva queda confirmada.'
    return (
      <SentPanel
        look={look}
        Title={Title}
        titleId={titleId}
        email={emailState.email}
        firstName={emailState.firstName}
        sentAt={emailState.at}
        next={next}
        sentMessage={sentMessage}
        scope={scope}
        action={action}
        onChangeEmail={() => setDiscarded(emailState)}
      />
    )
  }

  const emailForm = (
    <form action={emailDispatch} className={glass ? 'grid gap-3' : 'space-y-4'} noValidate>
      {hidden}
      <div className={glass ? 'grid gap-1.5' : 'space-y-2'}>
        <Label htmlFor="gate-email" className={glass ? undefined : 'text-base'}>
          Email
        </Label>
        <Input
          ref={emailRef}
          id="gate-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="vos@email.com"
          defaultValue={values.email}
          onChange={() => setEditedAt(state)}
          aria-invalid={emailError ? 'true' : undefined}
          aria-describedby={
            [emailError && 'gate-email-error', rival && 'gate-email-help']
              .filter(Boolean)
              .join(' ') || undefined
          }
          className={skin.input}
        />
        {emailError && (
          <p id="gate-email-error" role="alert" className={errorClass}>
            {emailError}
          </p>
        )}
        {rival && (
          <p id="gate-email-help" className={skin.help}>
            Te mandamos un enlace para entrar. Sin contraseña.
          </p>
        )}
      </div>
      {emailSendError && (
        <p role="alert" className={errorClass}>
          {emailSendError}
        </p>
      )}
      <SubmitButton {...skin.go} pendingLabel="Enviando…">
        Continuar con mi email
      </SubmitButton>
    </form>
  )

  const googleBlock = (
    <div className={glass ? 'grid gap-3' : 'space-y-3'}>
      <form action={googleDispatch}>
        {hidden}
        <SubmitButton {...skin.alt} pendingLabel="Abriendo Google…">
          <GoogleIcon className={glass ? 'size-5' : 'mr-2 size-5'} />
          Continuar con Google
        </SubmitButton>
      </form>
      {googleSendError && (
        <p role="alert" className={errorClass}>
          {googleSendError}
        </p>
      )}
    </div>
  )

  const divider = glass ? (
    <div aria-hidden className={skin.divider}>
      o
    </div>
  ) : (
    <div aria-hidden className={skin.divider}>
      <div className="h-px flex-1 bg-border" />o<div className="h-px flex-1 bg-border" />
    </div>
  )

  return (
    <div className={glass ? 'grid gap-3' : 'space-y-6'}>
      <div>
        {/* `pr-6`: deja libre el lugar de la X del diálogo (el título RIVAL llega hasta ahí a 390 px). */}
        <Title id={titleId} className={glass ? 'rv-h2' : cn(AUTH_TITLE, 'pr-6')}>
          {rival ? (
            <>
              Entrá para <span style={AUTH_ACCENT_STYLE}>{rivalCopy.accent}</span>
              {rivalCopy.after}
            </>
          ) : glass ? (
            'Entrá para reservar'
          ) : (
            <>
              Entrá para <span style={AUTH_ACCENT_STYLE}>reservar</span>
            </>
          )}
        </Title>
        {rival ? (
          <p className={skin.lead}>{rivalCopy.lead}</p>
        ) : (
          !withDeposit && <p className={skin.lead}>Entrás y la reserva queda confirmada.</p>
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
      <p className={skin.legal}>
        Al continuar declarás que sos mayor de 18 años y aceptás los{' '}
        <Link
          href="/terminos"
          target="_blank"
          rel="noopener noreferrer"
          className={cn('inline-flex min-h-11 items-center', skin.link)}
        >
          Términos y condiciones
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </Link>
        .
      </p>
    </div>
  )
}

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

/** Sin `id`: un `id={undefined}` pisaría el que Radix le da para nombrar el diálogo. */
function DialogHeading({ children, id: _id, ...props }: TitleProps) {
  return <DialogTitle {...props}>{children}</DialogTitle>
}

function PanelHeading({ children, ...props }: TitleProps) {
  return <h2 {...props}>{children}</h2>
}

/**
 * El ingreso en un modal que abre un botón: lo usa RIVAL ("Voy", armar y pedir). La pantalla de
 * confirmar ya no lo usa: tiene el ingreso adentro (`LoginPanel`). Las actions entran por PROP
 * (ver CheckoutFlow).
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
  purpose = 'voy',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  next: string
  action: SendPlayerMagicLink
  googleAction: StartGoogleLoginFromReservar
  inAppBrowser?: boolean
} & GateVariant) {
  const rival = variant === 'rival'
  const gate = useGate(action, googleAction, rival ? 'rival' : 'reservar')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={GATE_CONTENT} style={GATE_CARD_STYLE}>
        <GateBody
          gate={gate}
          look="dialog"
          Title={DialogHeading}
          next={next}
          action={action}
          inAppBrowser={inAppBrowser}
          withDeposit={withDeposit}
          rival={rival}
          purpose={purpose}
        />
      </DialogContent>
    </Dialog>
  )
}

/**
 * El ingreso dentro de la pantalla de confirmar (portal de vidrio F5, `reservar.html`): un panel de
 * vidrio pintado debajo del resumen, en lugar del botón que abría el modal. Entrar devuelve a esta
 * misma pantalla con la reserva (el `next` lleva el turno): sin seña queda confirmada, con seña
 * aparece "Pagar seña".
 */
export function LoginPanel({
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
  const gate = useGate(action, googleAction, 'reservar')
  return (
    <section
      aria-labelledby="gate-title"
      className="rv-panel glass-painted rv-rise"
      style={{ '--i': 1 } as CSSProperties}
    >
      <GateBody
        gate={gate}
        look="glass"
        Title={PanelHeading}
        titleId="gate-title"
        next={next}
        action={action}
        inAppBrowser={inAppBrowser}
        withDeposit={withDeposit}
        rival={false}
        purpose="voy"
      />
    </section>
  )
}

/**
 * "Enviado": el foco pasa al título (el formulario, y el botón que lo tenía, desaparecieron). Dice
 * la verdad de hoy: sin seña, tocar el enlace deja la reserva confirmada; con seña trae de vuelta
 * a esta pantalla con la cuenta, y ahí se paga. A diferencia de /ingresar, acá la action SÍ crea
 * la cuenta, así que no hay "si tiene cuenta". En el panel de vidrio entra por reemplazo, con el
 * sobre haciendo su toque.
 */
function SentPanel({
  look,
  Title,
  titleId,
  email,
  firstName,
  sentAt,
  next,
  sentMessage,
  scope,
  action,
  onChangeEmail,
}: {
  look: Look
  Title: (props: TitleProps) => ReactNode
  titleId?: string
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
  const glass = look === 'glass'
  const skin = SKIN[look]

  return (
    <div className={glass ? 'rv-swap grid gap-3' : undefined}>
      {glass && (
        <span className="rv-tap grid size-12 place-items-center rounded-full border border-portal-inner-line bg-portal-inner text-portal-green">
          <Mail className="size-6" aria-hidden />
        </span>
      )}
      <Title
        ref={heading}
        id={titleId}
        tabIndex={-1}
        className={glass ? 'rv-h2 outline-hidden' : cn(AUTH_TITLE, 'outline-hidden')}
      >
        {glass ? (
          'Revisá tu email'
        ) : (
          <>
            Revisá tu <span style={AUTH_ACCENT_STYLE}>email</span>
          </>
        )}
      </Title>
      <div className={glass ? 'grid gap-2' : undefined}>
        <p
          className={
            glass
              ? 'break-words text-base text-portal-ink'
              : 'mt-3 break-words text-base text-foreground'
          }
        >
          Te mandamos un enlace a <strong className="font-semibold">{email}</strong>.
        </p>
        <p className={glass ? 'rv-sub mt-0' : 'mt-2 text-pretty text-base text-muted-foreground'}>
          {sentMessage}
        </p>
        <p className={glass ? 'rv-small' : 'mt-2 text-pretty text-sm text-muted-foreground'}>
          ¿No llegó? Revisá la carpeta de correo no deseado o que el email esté bien escrito.
        </p>
      </div>
      <div className={glass ? 'flex flex-wrap items-start gap-2' : 'mt-6 space-y-3'}>
        <ResendLinkForm
          action={action}
          fields={{ email, firstName, next, terms: 'on' }}
          sentAt={sentAt}
          scope={scope}
          resentNotice="Listo: te mandamos otro enlace. Usá el del último correo."
          button={glass ? skin.ghost : undefined}
        />
        <Button type="button" {...skin.ghost} onClick={onChangeEmail}>
          Usar otro email
        </Button>
      </div>
    </div>
  )
}
