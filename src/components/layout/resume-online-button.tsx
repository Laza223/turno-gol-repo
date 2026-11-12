'use client'

import { useState, useTransition } from 'react'
import type { ActionResult } from '@/shared/types/action-result'

/**
 * "Ya marqué mis ocupados": reabre la reserva online del plan gratis en pausa.
 * La action llega por prop (no se importa un módulo 'use server' desde acá).
 */
export function ResumeOnlineButton({ action }: { action: () => Promise<ActionResult> }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    startTransition(async () => {
      const result = await action()
      if (!result.success) startTransition(() => setError(result.error))
    })
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-busy={pending}
        className="inline-flex min-h-11 items-center px-1 font-semibold underline underline-offset-2 transition-colors duration-150 shrink-0 hover:text-amber-900 disabled:opacity-60 md:min-h-0 dark:hover:text-amber-300"
      >
        Ya marqué mis ocupados
      </button>
      {error && (
        <span role="alert" className="text-xs">
          {error}
        </span>
      )}
    </span>
  )
}
