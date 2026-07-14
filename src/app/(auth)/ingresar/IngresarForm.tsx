'use client'

import { useFormStatus } from 'react-dom'
import { useActionState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, Mail } from 'lucide-react'
import type { PlayerLoginState } from './actions'

const initial: PlayerLoginState = { status: 'idle' }

/** Firma de la Server Action que consume el form. */
export type PlayerLoginAction = (
  prevState: PlayerLoginState,
  formData: FormData,
) => Promise<PlayerLoginState>

const inputClass =
  'h-11 w-full rounded-lg border border-white/10 bg-white/4 px-3.5 text-sm text-white placeholder:text-slate-500 transition-colors focus-visible:border-emerald-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 aria-invalid:border-red-500'

/** Glass dark premium (espeja LoginGate / retorno de reserva). */
const cardStyle = {
  background: 'linear-gradient(180deg, rgba(15,23,42,.72), rgba(2,6,23,.85))',
  border: '1px solid rgba(255,255,255,.1)',
  boxShadow: '0 0 60px rgba(16,185,129,.12), 0 40px 80px -42px rgba(0,0,0,.9)',
} as const

/**
 * Bloque cliente de /ingresar (aviso ?deleted=1 + magic link). La action llega
 * por PROP: './actions' es `'use server'` y arrastra request-context →
 * `node:async_hooks`, que Vite externaliza en el browser y rompe la story si
 * se importa como valor.
 */
export function IngresarForm({ action }: { action: PlayerLoginAction }) {
  return (
    <Suspense fallback={null}>
      <DeletedNotice />
      <FormCard action={action} />
    </Suspense>
  )
}

function DeletedNotice() {
  const searchParams = useSearchParams()
  if (searchParams.get('deleted') !== '1') return null
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/10">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
      </div>
      <div>
        <p className="font-semibold text-emerald-200">Tu cuenta fue eliminada</p>
        <p className="mt-0.5 text-xs text-emerald-300/80">
          Lamentamos verte partir. Podés volver cuando quieras.
        </p>
      </div>
    </div>
  )
}

function FormCard({ action }: { action: PlayerLoginAction }) {
  const [state, formAction] = useActionState(action, initial)
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/mis-reservas'

  if (state.status === 'sent') {
    return (
      <div className="rounded-2xl p-8 text-center" style={cardStyle}>
        <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
          <span aria-hidden className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/30 motion-reduce:hidden" />
          <span
            className="relative flex h-16 w-16 items-center justify-center rounded-full text-emerald-300"
            style={{
              background: 'radial-gradient(closest-side, rgba(16,185,129,.28), rgba(2,6,23,.4))',
              border: '1px solid rgba(16,185,129,.4)',
              boxShadow: '0 0 50px rgba(16,185,129,.45)',
            }}
          >
            <Mail className="h-6 w-6" aria-hidden />
          </span>
        </div>
        <h1 className="font-display text-2xl font-black italic tracking-tight text-white">Revisá tu email</h1>
        <p className="mt-3 text-sm text-slate-400">
          Te enviamos un enlace de acceso a <strong className="text-slate-200">{state.email}</strong>.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-8" style={cardStyle}>
      <header className="mb-6 space-y-1">
        <h1 className="font-display text-3xl font-black italic tracking-tight text-white">
          Accedé a tu{' '}
          <span
            style={{
              background: 'linear-gradient(100deg, #6ee7b7, #34d399 45%, #10b981)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            cuenta
          </span>
        </h1>
        <p className="text-sm text-slate-400">Te enviamos un enlace seguro de acceso a tu email. Sin contraseñas que recordar.</p>
      </header>

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-slate-300">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="vos@email.com"
            aria-invalid={state.status === 'error' ? 'true' : undefined}
            className={inputClass}
          />
        </div>
        {state.status === 'error' && (
          <p role="alert" className="text-xs text-red-300">
            {state.message}
          </p>
        )}
        <SubmitButton />
      </form>
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="group inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/35 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617] disabled:translate-y-0 disabled:opacity-60"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Enviando…
        </>
      ) : (
        'Enviarme el enlace'
      )}
    </button>
  )
}
