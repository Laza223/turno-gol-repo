'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Loader2, Mail } from 'lucide-react'
import { sendPlayerMagicLink, type GateState } from '../actions'

const initial: GateState = { status: 'idle' }

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-60">
      {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Enviando…</> : 'Continuar con email'}
    </button>
  )
}

export default function LoginGate({ next }: { next: string }) {
  const [state, formAction] = useFormState(sendPlayerMagicLink, initial)

  if (state.status === 'sent') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100"><Mail className="h-5 w-5 text-emerald-700" aria-hidden /></div>
        <h2 className="text-base font-semibold text-slate-900">Revisá tu email</h2>
        <p className="mt-2 text-sm text-slate-600">Te enviamos un enlace a <strong>{state.email}</strong>. Hacé click para confirmar tu reserva.</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4" noValidate>
      <div>
        <h2 className="text-base font-semibold text-slate-900">Confirmá con tu email</h2>
        <p className="text-sm text-slate-600">Sin contraseñas. Te mandamos un enlace mágico para entrar y reservar.</p>
      </div>
      <input type="hidden" name="next" value={next} />
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-900">Nombre</span>
          <input name="firstName" required className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-900">Apellido</span>
          <input name="lastName" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" />
        </label>
      </div>
      <label className="space-y-1 text-sm block">
        <span className="font-medium text-slate-900">Email</span>
        <input name="email" type="email" autoComplete="email" required placeholder="vos@email.com" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" />
      </label>
      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
        <span>Soy mayor de 18 años y acepto los términos y condiciones de uso (declaración jurada).</span>
      </label>
      {state.status === 'error' && <p role="alert" className="text-xs text-red-600">{state.message}</p>}
      <Submit />
    </form>
  )
}
