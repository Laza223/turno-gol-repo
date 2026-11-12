'use client'

import { useState, useTransition } from 'react'
import type { PolicyActionResult } from './actions'

/** Firma de `setCanteenEnabledAction`: entra por prop, no por import de valor. */
export type SetCanteenEnabled = (enabled: boolean) => Promise<PolicyActionResult>

/** "Vendo en el buffet o kiosco": con esto apagado el panel no muestra Vender ni Productos. */
export function CanteenSwitch({
  initialEnabled,
  action,
}: {
  initialEnabled: boolean
  action: SetCanteenEnabled
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const toggle = () => {
    if (isPending) return
    const next = !enabled
    setEnabled(next)
    setError(null)
    startTransition(async () => {
      const res = await action(next)
      if (!res.success) {
        startTransition(() => {
          setEnabled(!next)
          setError(res.error)
        })
      }
    })
  }

  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-labelledby="canteen-switch-label"
        disabled={isPending}
        onClick={toggle}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          enabled ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
            enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
      <div className="min-w-0">
        <p id="canteen-switch-label" className="text-sm font-medium text-foreground">
          Vendo en el buffet o kiosco
        </p>
        <p className="text-xs text-muted-foreground">
          Si lo apagás, el panel esconde Vender y Productos. Tus productos y ventas quedan
          guardados.
        </p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
