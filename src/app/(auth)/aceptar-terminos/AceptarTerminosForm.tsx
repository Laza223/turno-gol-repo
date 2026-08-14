'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'
import type { acceptTermsAction, AcceptTermsState } from './actions'

const initial: AcceptTermsState = { status: 'idle' }

export type AcceptTermsActionFn = typeof acceptTermsAction

/** Mismo lenguaje visual "glass" oscuro que IngresarForm.tsx. */
const cardStyle = {
  background: 'linear-gradient(180deg, rgba(15,23,42,.72), rgba(2,6,23,.85))',
  border: '1px solid rgba(255,255,255,.1)',
  boxShadow: '0 0 60px rgba(16,185,129,.12), 0 40px 80px -42px rgba(0,0,0,.9)',
} as const

export function AceptarTerminosForm({
  action,
  next,
}: {
  action: AcceptTermsActionFn
  next: string
}) {
  const [state, formAction] = useActionState(action, initial)

  return (
    <div className="rounded-2xl p-8" style={cardStyle}>
      <header className="mb-6 space-y-1">
        <h1 className="font-display text-2xl font-black italic tracking-tight text-white">
          Un último paso
        </h1>
        <p className="text-sm text-slate-400">Confirmá esto para terminar de crear tu cuenta.</p>
      </header>

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <label className="flex items-start gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            name="terms"
            required
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/4 text-emerald-600 focus-visible:ring-emerald-500"
          />
          <span>
            Soy mayor de 18 años y acepto los{' '}
            <Link href="/terminos" className="text-emerald-300 underline hover:text-emerald-200">
              términos y condiciones
            </Link>{' '}
            de uso (declaración jurada).
          </span>
        </label>
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
      className="group inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/35 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617] disabled:translate-y-0 disabled:opacity-60"
    >
      {pending ? (
        <>
          <TgBallSpinner size="xs" className="mr-2" aria-hidden />
          Guardando…
        </>
      ) : (
        'Continuar'
      )}
    </button>
  )
}
