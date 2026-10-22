'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusBadge } from '@/components/ui/plus-badge'
import type { SupportActionResult } from '../actions'

export type SetTenantPlusAction = (
  tenantId: string,
  enabled: boolean,
) => Promise<SupportActionResult>

type Props = {
  tenantId: string
  initialEnabled: boolean
  action: SetTenantPlusAction
}

/**
 * Interruptor de TurnoGol Plus (el extra pago del Asistente de WhatsApp) para un
 * complejo. Prende o apaga el override por complejo del flag `whatsapp_bot`.
 */
export function PlusToggle({ tenantId, initialEnabled, action }: Props) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleToggle = () => {
    if (isPending) return
    const next = !enabled
    setEnabled(next)
    setError(null)

    startTransition(async () => {
      const res = await action(tenantId, next)
      if (res.success) {
        router.refresh()
      } else {
        startTransition(() => {
          setEnabled(enabled)
          setError(res.error)
        })
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="TurnoGol Plus · Asistente de WhatsApp"
          disabled={isPending}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-plus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
            enabled ? 'bg-plus' : 'bg-muted-foreground/30'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
              enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`}
          />
        </button>
        <PlusBadge />
        <span className="text-sm font-medium text-foreground">
          {enabled ? 'Activado' : 'Desactivado'}
        </span>
        {isPending && (
          <span className="text-xs text-muted-foreground animate-pulse">Guardando…</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Prendelo cuando el complejo paga el extra. Después el dueño conecta su número desde Ajustes.
      </p>
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
