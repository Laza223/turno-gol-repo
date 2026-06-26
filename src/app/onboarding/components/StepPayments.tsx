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
          <h2 className="text-2xl font-bold tracking-tight text-foreground">MercadoPago</h2>
          <p className="text-sm text-muted-foreground mt-1">Cobro online</p>
        </div>
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-4 text-sm text-emerald-900 dark:text-emerald-100">
          <p className="font-medium">MercadoPago conectado exitosamente.</p>
          <p className="text-emerald-800 dark:text-emerald-200 mt-1">
            Tus jugadores podrán pagar señas online al reservar.
          </p>
        </div>
        <button
          onClick={handleSkip}
          disabled={isPending}
          className="w-full h-11 bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none transition-all duration-200"
        >
          {isPending ? 'Finalizando...' : 'Ir al dashboard →'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">¿Cobrás seña?</h2>
        <p className="text-sm text-muted-foreground mt-1">Cobro online</p>
      </div>

      <p className="text-sm text-muted-foreground">
        Conectá tu cuenta de MercadoPago para cobrar señas online. El dinero va directo a tu
        cuenta, sin intermediarios.
      </p>

      <div className="space-y-3">
        <a
          href="/api/mp/oauth-start"
          className="flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-200"
        >
          Conectar MercadoPago
        </a>

        <button
          onClick={handleSkip}
          disabled={isPending}
          className="w-full h-11 border border-border bg-card text-foreground rounded-lg text-sm font-medium hover:bg-accent hover:border-border disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Finalizando...' : 'Terminar sin seña'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Podés conectar MercadoPago en cualquier momento desde Configuración.
      </p>
    </div>
  )
}
