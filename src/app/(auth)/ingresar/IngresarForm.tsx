'use client'

import { Suspense, useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { unstable_rethrow, useSearchParams } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import { GoogleIcon } from '@/components/icons/GoogleIcon'
import {
  PORTAL_BUTTON,
  PORTAL_BUTTON_OUTLINE,
  PORTAL_INPUT,
  PORTAL_TITLE,
} from '@/components/world/PortalAuthFrame'
import { useNowMs } from '@/hooks/use-now'
import { echoFields } from '@/shared/forms/echo'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { PlayerLoginState, startGoogleLoginFromIngresar } from './actions'

/**
 * Lo que devuelve la action, más lo que solo sabe el cliente: que la request no llegó (se cortó la
 * red o la pestaña quedó vieja) y `at`, el reloj en que contestó el servidor, que arranca la espera
 * del reenvío. Un corte conserva el `at` anterior: sin respuesta no hay espera nueva.
 */
type LoginState = (PlayerLoginState | { status: 'unreached'; message: string; email?: string }) & {
  at: number
}

const initial = { status: 'idle', at: 0 } as const satisfies LoginState

const OFFLINE_MESSAGE = 'No pudimos enviar el enlace. Revisá tu conexión e intentá de nuevo.'
const STALE_MESSAGE = 'La página quedó desactualizada. Recargala y probá de nuevo.'

const errorOf = (state: LoginState) =>
  state.status === 'error' || state.status === 'unreached' ? state.message : null

/**
 * Un minuto entre un envío y el siguiente: es el piso por defecto de Supabase entre dos mails
 * al mismo usuario (el local lo baja a 1 s) y lo que la action pide cuando limita ("Esperá un
 * minuto"). Reenviar antes terminaría en "No pudimos enviar el email".
 */
const RESEND_WAIT_SECONDS = 60
const ONE_SECOND = 1000

/** Firma de la Server Action que consume el form. */
export type PlayerLoginAction = (
  prevState: PlayerLoginState,
  formData: FormData,
) => Promise<PlayerLoginState>
export type StartGoogleLoginFromIngresar = typeof startGoogleLoginFromIngresar

/** Los tres navegadores rechazan un fetch caído con un TypeError, cada uno con su texto. */
const isNetworkError = (err: unknown): err is TypeError =>
  err instanceof TypeError && /failed to fetch|load failed|networkerror/i.test(err.message)

/**
 * La pestaña quedó de antes de un deploy y el servidor no reconoce la action: Next rechaza con un
 * `UnrecognizedActionError` (next/dist/client/components/unrecognized-action-error.js). Se mira el
 * `name` y no se usa `unstable_isUnrecognizedActionError` de next/navigation porque, con el import
 * nombrado, las stories no cargaban ("does not provide an export named", con el mock de
 * @storybook/nextjs-vite), y el import directo de next/dist ataría el código a un camino interno.
 * tests/unit/ingresar-resend.test.tsx tira la clase real de Next: si cambia el nombre, falla ahí.
 */
const isStaleAction = (err: unknown): boolean =>
  err instanceof Error && err.name === 'UnrecognizedActionError'

/**
 * Corre la action del email. Si la request no llega la action RECHAZA, y sin este catch la
 * excepción sube hasta (auth)/error.tsx, que le ofrece al jugador el login del staff.
 * - `unstable_rethrow` va primero: un redirect() de la action viaja como excepción y no se lo
 *   puede tragar el catch. playerLoginAction hoy no lo hace; la de Google y la de /aceptar-terminos
 *   sí, y no se envuelven.
 * - Una pestaña de antes de un deploy no reconoce la action: pide recargar, no es una falla.
 * - Un corte de red es normal (un 4G inestable): breadcrumb, no evento. Cualquier otro rechazo es
 *   una falla real del servidor y va a Sentry.
 */
async function callLogin(
  action: PlayerLoginAction,
  prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    const result = await action(prev.status === 'unreached' ? initial : prev, formData)
    return { ...result, at: Date.now() }
  } catch (err) {
    unstable_rethrow(err)
    const unreached = (message: string): LoginState => ({
      status: 'unreached',
      message,
      email: echoFields(formData, ['email'] as const).email,
      at: prev.at,
    })
    if (isStaleAction(err)) return unreached(STALE_MESSAGE)
    if (isNetworkError(err)) {
      Sentry.addBreadcrumb({
        category: 'auth',
        level: 'warning',
        message: 'ingresar: la request del enlace no llegó',
        data: { error: err.message },
      })
    } else {
      Sentry.captureException(err)
    }
    return unreached(OFFLINE_MESSAGE)
  }
}

/**
 * El link a Explorar: el mismo en el formulario y en el bloque de primera vez del "enviado".
 * El padding vertical en un elemento EN LÍNEA no cambia el alto del renglón ni el layout, pero
 * agranda el área que recibe el toque a 44 px o más (también en cada fragmento si el link parte).
 */
const exploreLinkClass =
  'py-3.5 font-semibold text-emerald-700 underline underline-offset-4 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300'

const errorClass = cn('text-sm font-medium', TONE_TEXT.destructive)

/**
 * Bloque cliente de /ingresar (aviso ?deleted=1 + magic link). La action llega
 * por PROP: './actions' es `'use server'` y arrastra request-context →
 * `node:async_hooks`, que Vite externaliza en el browser y rompe la story si
 * se importa como valor.
 *
 * `inAppBrowser` lo resuelve el servidor (page.tsx) con el User-Agent: en el navegador
 * interno de Instagram, Facebook o TikTok va primero el email, porque Google puede no abrir.
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
      className="mb-6 flex items-start gap-3 rounded-lg border bg-muted p-4 text-sm"
    >
      <CheckCircle2
        className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-400"
        aria-hidden
      />
      <div>
        <p className="font-semibold text-foreground">Tu cuenta fue eliminada</p>
        <p className="mt-0.5 text-muted-foreground">
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
          className={PORTAL_INPUT}
        />
        {error && (
          <p id="email-error" role="alert" className={errorClass}>
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

  const googleBlock = (
    <div className="space-y-3">
      <GoogleForm googleAction={googleAction} next={next} />
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
    <>
      <div>
        <h1 className={PORTAL_TITLE}>Accedé a tu cuenta</h1>
        <p className="mt-2 text-pretty text-base text-muted-foreground">
          Entrá para ver tus reservas y reservar sin cargar tus datos cada vez.
        </p>
      </div>
      <div className="mt-8 space-y-6">
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
      </div>
      {/* Acá y no en page.tsx: en el "enviado" ese lugar lo ocupa el bloque de primera vez. */}
      <p className="mt-8 text-sm text-muted-foreground">
        ¿Primera vez en TurnoGol?{' '}
        <Link href="/explorar" className={exploreLinkClass}>
          Descubrí complejos y reservá tu cancha
        </Link>
      </p>
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
      <h1 ref={heading} tabIndex={-1} className={cn(PORTAL_TITLE, 'outline-hidden')}>
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
        <ResendForm email={email} sentAt={sentAt} next={next} action={action} />
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
    </>
  )
}

/**
 * "Reenviar" corre la MISMA action que el formulario. Queda bloqueado un minuto cada vez que el
 * servidor contesta (el primer envío incluido) y mientras la action corre, así que un doble toque
 * manda un solo mail. Si la action limita o falla, su mensaje se muestra tal cual.
 *
 * La espera se calcula contra el reloj, no contando ticks: iOS y los WebViews frenan los timers con
 * la app en segundo plano, y quien vuelve de Mail a los 90 s vería una cuenta atrasada. Sale de
 * `at` (cuándo contestó el servidor), así que el aviso y la espera nuevos llegan en el MISMO estado:
 * no hay dos actualizaciones que se puedan desfasar.
 */
function ResendForm({
  email,
  sentAt,
  next,
  action,
}: {
  email: string
  sentAt: number
  next: string
  action: PlayerLoginAction
}) {
  const [state, formAction] = useActionState(
    (prev: LoginState, formData: FormData) => callLogin(action, prev, formData),
    initial,
  )
  const now = useNowMs(ONE_SECOND)
  const deadline = Math.max(state.at, sentAt) + RESEND_WAIT_SECONDS * 1000
  // El tope: el reloj compartido puede traer una lectura anterior a la respuesta del servidor.
  const left = Math.min(RESEND_WAIT_SECONDS, Math.max(0, Math.ceil((deadline - now) / 1000)))
  const waiting = left > 0
  const error = errorOf(state)

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <SubmitButton
        variant="outline"
        className={cn(PORTAL_BUTTON_OUTLINE, 'tabular-nums')}
        pendingLabel="Reenviando…"
        disabled={waiting}
      >
        {waiting ? `Reenviar en ${left} s` : 'Reenviar enlace'}
      </SubmitButton>
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
      {state.status === 'sent' && (
        <p role="status" className="text-sm text-muted-foreground">
          Listo: si ese email tiene cuenta, te llega otro enlace. Usá el del último correo.
        </p>
      )}
    </form>
  )
}
