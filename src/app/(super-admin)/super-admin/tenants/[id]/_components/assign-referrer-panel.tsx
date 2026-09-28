'use client'

import { useState, useTransition } from 'react'
import type { AssignReferrerResult } from '../actions'

/**
 * Firma de `assignReferrerAction` (../actions). Entra por PROP, no por import:
 * '../actions' es `'use server'` y arrastra drizzle/node:async_hooks al bundle
 * del browser, rompiendo Storybook — mismo motivo que `ReferralLinkPanel`.
 */
export type AssignReferrerAction = (input: {
  tenantId: string
  code: string
}) => Promise<AssignReferrerResult>

type Props = {
  tenantId: string
  initialReferrerName: string | null
  action: AssignReferrerAction
}

/**
 * "Asignar referidor" (B2): para el complejo que llegó por WhatsApp, sin pasar
 * por `/r/<CODE>`. Pega el código pelado o el link completo de la landing.
 */
export function AssignReferrerPanel({ tenantId, initialReferrerName, action }: Props) {
  const [referrerName, setReferrerName] = useState(initialReferrerName)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAssign() {
    if (!code.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await action({ tenantId, code })
      if (res.success) {
        setReferrerName(res.referrerName)
      } else {
        // Después del await, un set* suelto ya no es parte de la transición.
        startTransition(() => setError(res.error))
      }
    })
  }

  if (referrerName) {
    return <p className="text-sm text-foreground">Referido por: {referrerName}</p>
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Código o link /r/…"
          aria-label="Código o link de referidos"
          className="h-8 w-48 rounded-md border border-border bg-card px-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
        />
        <button
          type="button"
          disabled={isPending || !code.trim()}
          onClick={handleAssign}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Asignando…' : 'Asignar'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
