'use client'

import { useTransition } from 'react'
import { skipMpAction } from '../actions'

interface StepPaymentsProps {
  mpConnected: boolean
}

export function StepPayments({ mpConnected }: StepPaymentsProps) {
  const [isPending, startTransition] = useTransition()

  function handleSkip() {
    startTransition(async () => {
      await skipMpAction()
    })
  }

  if (mpConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">MercadoPago</h2>
          <p className="text-sm text-gray-500 mt-1">Paso 4 de 4 — Cobro online</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-medium">MercadoPago conectado exitosamente.</p>
          <p className="text-green-700 mt-1">
            Tus jugadores podrán pagar señas online al reservar.
          </p>
        </div>
        <button
          onClick={handleSkip}
          disabled={isPending}
          className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Finalizando...' : 'Ir al dashboard →'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">¿Cobrás seña?</h2>
        <p className="text-sm text-gray-500 mt-1">Paso 4 de 4 — Cobro online</p>
      </div>

      <p className="text-sm text-gray-600">
        Conectá tu cuenta de MercadoPago para cobrar señas online. El dinero va directo a tu
        cuenta, sin intermediarios.
      </p>

      <div className="space-y-3">
        <a
          href="/api/mp/oauth-start"
          className="block w-full text-center bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Conectar MercadoPago
        </a>

        <button
          onClick={handleSkip}
          disabled={isPending}
          className="w-full border border-gray-300 text-gray-700 py-2 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Finalizando...' : 'Terminar sin seña'}
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Podés conectar MercadoPago en cualquier momento desde Configuración.
      </p>
    </div>
  )
}
