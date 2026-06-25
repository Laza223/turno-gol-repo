'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Loader2, Mail } from 'lucide-react'
import { sendPlayerMagicLink, type GateState } from '../actions'

const initial: GateState = { status: 'idle' }

const cardStyle = {
  background: 'linear-gradient(180deg, rgba(15,23,42,.72), rgba(2,6,23,.85))',
  border: '1px solid rgba(255,255,255,.1)',
  boxShadow: '0 0 60px rgba(16,185,129,.12), 0 40px 80px -42px rgba(0,0,0,.9)',
} as const

const inputClass =
  'h-11 w-full rounded-lg border border-white/10 bg-white/[.04] px-3 text-sm text-white placeholder:text-slate-500 transition-colors focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/35 disabled:translate-y-0 disabled:opacity-60 motion-reduce:hover:translate-y-0">
      {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Enviando…</> : 'Continuar con email'}
    </button>
  )
}

export default function LoginGate({ next }: { next: string }) {
  const [state, formAction] = useFormState(sendPlayerMagicLink, initial)

  if (state.status === 'sent') {
    return (
      <div className="rounded-2xl p-6 text-center" style={cardStyle}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-emerald-300" style={{ background: 'rgba(16,185,129,.14)', border: '1px solid rgba(16,185,129,.35)' }}>
          <Mail className="h-5 w-5" aria-hidden />
        </div>
        <h2 className="font-display text-base font-bold text-white">Revisá tu email</h2>
        <p className="mt-2 text-sm text-slate-400">Te enviamos un enlace a <strong className="text-slate-200">{state.email}</strong>. Hacé click para confirmar tu reserva.</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4 rounded-2xl p-6" style={cardStyle} noValidate>
      <div>
        <h2 className="font-display text-base font-bold text-white">Confirmá con tu email</h2>
        <p className="text-sm text-slate-400">Sin contraseñas. Te mandamos un enlace mágico para entrar y reservar.</p>
      </div>
      <input type="hidden" name="next" value={next} />
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-300">Nombre</span>
          <input name="firstName" required className={inputClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-300">Apellido</span>
          <input name="lastName" className={inputClass} />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-slate-300">Email</span>
        <input name="email" type="email" autoComplete="email" required placeholder="vos@email.com" className={inputClass} />
      </label>
      <label className="flex items-start gap-2 text-xs text-slate-400">
        <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/[.04] text-emerald-600 focus-visible:ring-emerald-500" />
        <span>Soy mayor de 18 años y acepto los términos y condiciones de uso (declaración jurada).</span>
      </label>
      {state.status === 'error' && <p role="alert" className="text-xs text-red-300">{state.message}</p>}
      <Submit />
    </form>
  )
}
