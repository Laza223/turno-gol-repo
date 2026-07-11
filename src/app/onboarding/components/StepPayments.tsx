'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle2, ShieldCheck, Wallet } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { finishOnboardingAction, setWizardStepAction } from '../actions'

type Props = {
  mpConnected: boolean
  /** Código `?error=mp_*` del callback OAuth (pages/onboarding.md §6.2). */
  mpError: string | null
}

// Nunca mostrar el código crudo: siempre qué pasó + qué hacer (§6.7).
const MP_UNAVAILABLE = new Set(['mp_not_configured', 'mp_config_missing'])

function mpErrorMessage(code: string): string {
  if (MP_UNAVAILABLE.has(code)) {
    return 'La conexión con MercadoPago no está disponible en este momento. Terminá sin seña y conectala después desde Configuración.'
  }
  return 'No pudimos conectar MercadoPago. Probá de nuevo o terminá sin seña — lo conectás cuando quieras desde Configuración.'
}

/**
 * Paso 4 — ¿Cobrás seña? (pages/onboarding.md §6). Dos cards de decisión con
 * UN solo CTA primario visible según la elección. "Sí" termina en el OAuth de
 * MP (el callback activa la seña y cierra el wizard); "No" cierra el wizard
 * directo. Ambos caminos aterrizan en /onboarding/listo.
 */
export function StepPayments({ mpConnected, mpError }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isGoingBack, startBackTransition] = useTransition()
  const [backError, setBackError] = useState<string | null>(null)
  const [choice, setChoice] = useState<'deposit' | 'none'>('deposit')

  function handleFinish() {
    startTransition(async () => {
      await finishOnboardingAction()
    })
  }

  function handleBack() {
    setBackError(null)
    startBackTransition(async () => {
      const result = await setWizardStepAction(2)
      if (!result.success) setBackError(result.error)
    })
  }

  if (mpConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Señas</h2>
          <p className="text-sm text-muted-foreground mt-1">Cobro online con MercadoPago</p>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <div className="text-emerald-900 dark:text-emerald-100">
            <p className="font-medium">MercadoPago conectado.</p>
            <p className="mt-1 text-emerald-800 dark:text-emerald-200">
              Tus jugadores pagan la seña online al reservar y la plata va directo a tu cuenta.
            </p>
          </div>
        </div>
        <Button onClick={handleFinish} isLoading={isPending} className="w-full">
          Terminar y ver mi complejo
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">¿Cobrás seña?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          La seña baja los planazos: la reserva llega confirmada con plata adentro.
        </p>
      </div>

      {mpError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{mpErrorMessage(mpError)}</p>
        </div>
      )}

      <div role="radiogroup" aria-label="Cobro de seña" className="space-y-3">
        <label
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
            choice === 'deposit'
              ? 'border-emerald-600 bg-primary/5 dark:bg-emerald-500/10'
              : 'border-border bg-card hover:border-emerald-600/40',
          )}
        >
          <input
            type="radio"
            name="deposit-choice"
            value="deposit"
            checked={choice === 'deposit'}
            onChange={() => setChoice('deposit')}
            className="sr-only"
          />
          <Wallet
            className={cn(
              'mt-0.5 h-5 w-5 shrink-0',
              choice === 'deposit' ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
            )}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Cobrar seña online</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/25 dark:text-emerald-400 dark:ring-emerald-500/40">
                Recomendado
              </span>
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              El jugador paga un porcentaje al reservar que definís vos, por Mercado Pago. La plata
              va directo a tu cuenta, sin intermediarios.
            </span>
          </span>
        </label>

        <label
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
            choice === 'none'
              ? 'border-emerald-600 bg-primary/5 dark:bg-emerald-500/10'
              : 'border-border bg-card hover:border-emerald-600/40',
          )}
        >
          <input
            type="radio"
            name="deposit-choice"
            value="none"
            checked={choice === 'none'}
            onChange={() => setChoice('none')}
            className="sr-only"
          />
          <ShieldCheck
            className={cn(
              'mt-0.5 h-5 w-5 shrink-0',
              choice === 'none' ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
            )}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="text-sm font-semibold text-foreground">Sin seña por ahora</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Los jugadores reservan online y pagan al llegar. Activás la seña
              cuando quieras desde Configuración.
            </span>
          </span>
        </label>
      </div>

      {backError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {backError}
        </p>
      )}

      {/* Un solo CTA primario visible según la elección (§6.2). */}
      <div className="space-y-2">
        {choice === 'deposit' ? (
          <>
            <a href="/api/mp/oauth-start" className={cn(buttonVariants(), 'w-full')}>
              Conectar MercadoPago
            </a>
            <p className="text-center text-xs text-muted-foreground">
              Te llevamos a MercadoPago para autorizar los cobros. Tarda 2 minutos.
            </p>
          </>
        ) : (
          <Button onClick={handleFinish} isLoading={isPending} className="w-full">
            Terminar y ver mi complejo
          </Button>
        )}
      </div>

      <div className="flex justify-start">
        <Button type="button" variant="ghost" size="sm" onClick={handleBack} isLoading={isGoingBack}>
          Volver
        </Button>
      </div>
    </div>
  )
}
