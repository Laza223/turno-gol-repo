'use client'

import { useActionState } from 'react'
import { unstable_rethrow } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { SubmitButton } from '@/components/ui/submit-button'
import { PORTAL_BUTTON_OUTLINE } from '@/components/world/PortalAuthFrame'
import { useNowMs } from '@/hooks/use-now'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

/**
 * Lo compartido por las pantallas que mandan el enlace de ingreso por mail (`/ingresar` y el
 * ingreso de `/reservar`): llamar a la action sin que un corte de red tire la página, y el
 * "Reenviar" con su espera. Cada pantalla pone su formulario y su texto de "enviado".
 */

/** Lo mínimo que tiene que contestar una action que manda el enlace. */
export type MailActionState =
  { status: 'idle' } | { status: 'sent'; email: string } | { status: 'error'; message: string }
export type MailAction<S extends MailActionState> = (prev: S, formData: FormData) => Promise<S>

/**
 * Lo que devuelve la action, más lo que solo sabe el cliente: que la request no llegó (se cortó la
 * red o la pestaña quedó vieja) y `at`, el reloj en que contestó el servidor, que arranca la espera
 * del reenvío. Un corte conserva el `at` anterior: sin respuesta no hay espera nueva. `E` es lo que
 * la pantalla quiere conservar de lo tipeado cuando la request no llegó.
 */
export type MailState<S extends MailActionState, E extends object = object> = (
  S | ({ status: 'unreached'; message: string } & E)
) & { at: number }

const OFFLINE_MESSAGE = 'No pudimos enviar el enlace. Revisá tu conexión e intentá de nuevo.'
const STALE_MESSAGE = 'La página quedó desactualizada. Recargala y probá de nuevo.'

export const errorOf = (state: { status: string; message?: string }) =>
  state.status === 'error' || state.status === 'unreached' ? (state.message ?? null) : null

/** Un error de un campo o del envío: el mismo tono y tamaño en las dos pantallas. */
export const MAIL_ERROR_CLASS = cn('text-sm font-medium', TONE_TEXT.destructive)

/**
 * Un minuto entre un envío y el siguiente: es el piso por defecto de Supabase entre dos mails
 * al mismo usuario (el local lo baja a 1 s) y lo que la action pide cuando limita ("Esperá un
 * minuto"). Reenviar antes terminaría en "No pudimos enviar el email".
 */
const RESEND_WAIT_SECONDS = 60
const ONE_SECOND = 1000

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
 * excepción sube hasta el error boundary, que le ofrece al jugador el login del staff.
 * - `unstable_rethrow` va primero: un redirect() de la action viaja como excepción y no se lo
 *   puede tragar el catch (la de Google lo hace).
 * - Una pestaña de antes de un deploy no reconoce la action: pide recargar, no es una falla.
 * - Un corte de red es normal (un 4G inestable): breadcrumb, no evento. Cualquier otro rechazo es
 *   una falla real del servidor y va a Sentry.
 */
export async function callMailAction<S extends MailActionState, E extends object = object>(
  action: MailAction<S>,
  prev: MailState<S, E>,
  formData: FormData,
  {
    scope,
    echo,
    offlineMessage = OFFLINE_MESSAGE,
  }: {
    scope: string
    echo?: (formData: FormData) => E
    /** Qué dice un corte de red: la default habla del enlace; Google dice lo suyo. */
    offlineMessage?: string
  },
): Promise<MailState<S, E>> {
  try {
    const result = await action(
      prev.status === 'unreached' ? ({ status: 'idle' } as S) : (prev as S),
      formData,
    )
    return { ...result, at: Date.now() }
  } catch (err) {
    unstable_rethrow(err)
    const unreached = (message: string): MailState<S, E> =>
      ({ status: 'unreached', message, ...echo?.(formData), at: prev.at }) as MailState<S, E>
    if (isStaleAction(err)) return unreached(STALE_MESSAGE)
    if (isNetworkError(err)) {
      Sentry.addBreadcrumb({
        category: 'auth',
        level: 'warning',
        message: `${scope}: la request del enlace no llegó`,
        data: { error: err.message },
      })
    } else {
      Sentry.captureException(err)
    }
    return unreached(offlineMessage)
  }
}

/**
 * "Reenviar" corre la MISMA action que el formulario, con los mismos campos (`fields`, ocultos).
 * Queda bloqueado un minuto cada vez que el servidor contesta (el primer envío incluido) y mientras
 * la action corre, así que un doble toque manda un solo mail. Si la action limita o falla, su
 * mensaje se muestra tal cual; si manda, `resentNotice` lo dice.
 *
 * La espera se calcula contra el reloj, no contando ticks: iOS y los WebViews frenan los timers con
 * la app en segundo plano, y quien vuelve de Mail a los 90 s vería una cuenta atrasada. Sale de
 * `at` (cuándo contestó el servidor), así que el aviso y la espera nuevos llegan en el MISMO estado:
 * no hay dos actualizaciones que se puedan desfasar.
 */
export function ResendLinkForm({
  action,
  fields,
  sentAt,
  scope,
  resentNotice,
}: {
  /** La action del formulario, cualquiera sea su estado: acá solo importa que mande y qué conteste. */
  action: (prev: never, formData: FormData) => Promise<MailActionState>
  /** Lo que la action necesita para mandar el mismo mail (email, next…). */
  fields: Record<string, string>
  sentAt: number
  scope: string
  resentNotice: string
}) {
  const [state, formAction] = useActionState<MailState<MailActionState>, FormData>(
    (prev, formData) =>
      callMailAction(action as MailAction<MailActionState>, prev, formData, { scope }),
    { status: 'idle', at: 0 },
  )
  const now = useNowMs(ONE_SECOND)
  const deadline = Math.max(state.at, sentAt) + RESEND_WAIT_SECONDS * 1000
  // El tope: el reloj compartido puede traer una lectura anterior a la respuesta del servidor.
  const left = Math.min(RESEND_WAIT_SECONDS, Math.max(0, Math.ceil((deadline - now) / 1000)))
  const waiting = left > 0
  const error = errorOf(state)

  return (
    <form action={formAction} className="space-y-3">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton
        variant="outline"
        className={cn(PORTAL_BUTTON_OUTLINE, 'tabular-nums')}
        pendingLabel="Reenviando…"
        disabled={waiting}
      >
        {waiting ? `Reenviar en ${left} s` : 'Reenviar enlace'}
      </SubmitButton>
      {error && (
        <p role="alert" className={MAIL_ERROR_CLASS}>
          {error}
        </p>
      )}
      {state.status === 'sent' && (
        <p role="status" className="text-sm text-muted-foreground">
          {resentNotice}
        </p>
      )}
    </form>
  )
}
