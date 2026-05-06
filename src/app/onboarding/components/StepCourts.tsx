'use client'

import { useState, useTransition } from 'react'
import { advanceStepAction } from '../actions'

export function StepCourts() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleContinue() {
    setError(null)
    startTransition(async () => {
      const result = await advanceStepAction(2)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Tus Canchas</h2>
        <p className="text-sm text-slate-600 mt-1">Configuración de canchas</p>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-2">
        <p className="font-medium">Podés agregar tus canchas desde el panel de configuración.</p>
        <p className="text-emerald-800">
          Necesitás al menos 1 cancha en estado <strong>online</strong> para aparecer en búsquedas
          públicas y recibir reservas.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleContinue}
        disabled={isPending}
        className="w-full h-11 bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none transition-all duration-200"
      >
        {isPending ? 'Guardando...' : 'Continuar →'}
      </button>
    </div>
  )
}
