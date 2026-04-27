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
        <h2 className="text-xl font-semibold">Tus Canchas</h2>
        <p className="text-sm text-gray-500 mt-1">Paso 2 de 4 — Configuración de canchas</p>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 space-y-2">
        <p className="font-medium">Podés agregar tus canchas desde el panel de configuración.</p>
        <p className="text-blue-700">
          Necesitás al menos 1 cancha en estado <strong>online</strong> para aparecer en búsquedas
          públicas y recibir reservas.
        </p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={handleContinue}
        disabled={isPending}
        className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? 'Guardando...' : 'Continuar →'}
      </button>
    </div>
  )
}
