'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Mail } from 'lucide-react'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'
import type { sendPlayerMagicLink, GateState } from '../actions'

const initial: GateState = { status: 'idle' }

/** Firma de la Server Action que consume el form (ver ../actions#sendPlayerMagicLink). */
export type SendPlayerMagicLink = typeof sendPlayerMagicLink

// text-base en mobile: < 16px hace que iOS zoomee al enfocar. Está en el flujo
// de reserva, así que el zoom pega justo antes del pago.
export const inputClass =
  'h-11 w-full rounded-lg border border-border bg-background px-3 text-base md:text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus-visible:border-emerald-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-white/4'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 text-sm font-bold text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_30px_rgba(16,185,129,0.3)] transition-all duration-200 hover:brightness-105 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_12px_36px_rgba(16,185,129,0.4)] active:scale-[0.97] disabled:scale-100 disabled:opacity-60 whitespace-nowrap">
      {pending ? <><TgBallSpinner size="sm" className="mr-2" aria-hidden /> Enviando…</> : 'Continuar con email'}
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
  const [state, formAction] = useActionState(action, initial)
  // Repone lo tipeado tras un error: los inputs son NO controlados y el form
  // usa noValidate, así que toda validación pasa por el servidor.
  const vals = state.status === 'error' ? (state.values ?? {}) : {}

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
          <input name="firstName" required defaultValue={vals.firstName} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground/90">Apellido</span>
          <input name="lastName" defaultValue={vals.lastName} className={inputClass} />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-foreground/90">Email</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={vals.email} placeholder="vos@email.com" className={inputClass} />
      </label>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="terms" required defaultChecked={vals.terms} className="mt-0.5 h-4 w-4 rounded border-border bg-background text-emerald-600 focus-visible:ring-emerald-500 dark:border-white/20 dark:bg-white/4" />
        <span>Soy mayor de 18 años y acepto los términos y condiciones de uso (declaración jurada).</span>
      </label>
      {state.status === 'error' && <p role="alert" className="text-xs text-destructive dark:text-red-300">{state.message}</p>}
      <Submit />
    </form>
  )
}
