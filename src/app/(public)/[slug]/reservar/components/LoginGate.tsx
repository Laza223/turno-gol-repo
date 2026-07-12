'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Loader2, Mail } from 'lucide-react'
import type { sendPlayerMagicLink, GateState } from '../actions'

const initial: GateState = { status: 'idle' }

/** Firma de la Server Action que consume el form (ver ../actions#sendPlayerMagicLink). */
export type SendPlayerMagicLink = typeof sendPlayerMagicLink

const inputClass =
  'h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-white/[.04]'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-emerald-600/30 active:scale-[0.98] disabled:translate-y-0 disabled:opacity-60 motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25">
      {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Enviando…</> : 'Continuar con email'}
    </button>
  )
}

export default function LoginGate({
  next,
  action,
}: {
  next: string
  /** Server Action inyectada por la page (../actions#sendPlayerMagicLink). */
  action: SendPlayerMagicLink
}) {
  const [state, formAction] = useFormState(action, initial)

  if (state.status === 'sent') {
    return (
      <div className="reserva-receipt-card rounded-2xl p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-emerald-700 ring-1 ring-inset ring-emerald-600/30 dark:bg-emerald-500/[.14] dark:text-emerald-300 dark:ring-emerald-500/35">
          <Mail className="h-5 w-5" aria-hidden />
        </div>
        <h2 className="font-display text-base font-bold text-foreground">Revisá tu email</h2>
        <p className="mt-2 text-sm text-muted-foreground">Te enviamos un enlace a <strong className="text-foreground">{state.email}</strong>. Hacé click para confirmar tu reserva.</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="reserva-receipt-card space-y-4 rounded-2xl p-6" noValidate>
      <div>
        <h2 className="font-display text-base font-bold text-foreground">Confirmá con tu email</h2>
        <p className="text-sm text-muted-foreground">Sin contraseñas. Te mandamos un enlace mágico para entrar y reservar.</p>
      </div>
      <input type="hidden" name="next" value={next} />
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground/90">Nombre</span>
          <input name="firstName" required className={inputClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground/90">Apellido</span>
          <input name="lastName" className={inputClass} />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-foreground/90">Email</span>
        <input name="email" type="email" autoComplete="email" required placeholder="vos@email.com" className={inputClass} />
      </label>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 rounded border-border bg-background text-emerald-600 focus-visible:ring-emerald-500 dark:border-white/20 dark:bg-white/[.04]" />
        <span>Soy mayor de 18 años y acepto los términos y condiciones de uso (declaración jurada).</span>
      </label>
      {state.status === 'error' && <p role="alert" className="text-xs text-destructive dark:text-red-300">{state.message}</p>}
      <Submit />
    </form>
  )
}
