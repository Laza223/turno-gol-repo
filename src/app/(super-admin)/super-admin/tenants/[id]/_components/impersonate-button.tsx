'use client'

import { useState, useTransition } from 'react'
import { LogIn } from 'lucide-react'
import { startImpersonationAction } from '../actions'

/**
 * "Entrar como este complejo" (spec §6). Dispara startImpersonationAction, que
 * setea la cookie de impersonación y redirige a /dashboard. En éxito la action
 * redirige (no vuelve); solo manejamos el error.
 */
export function ImpersonateButton({
  tenantId,
  tenantName,
}: {
  tenantId: string
  tenantName: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (
      !window.confirm(
        `Vas a entrar al panel de "${tenantName}" como soporte. Todas tus acciones quedarán auditadas a tu nombre de super admin. ¿Continuar?`,
      )
    ) {
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await startImpersonationAction(tenantId)
      // Si la action redirigió, este código no corre. Solo llega acá en error.
      if (res && !res.success) setError(res.error)
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        {pending ? 'Entrando…' : 'Entrar como este complejo'}
      </button>
      <p className="text-xs text-slate-500">
        Abre el panel del complejo como soporte. Un banner rojo te recordará que
        estás impersonando; toda acción se audita como super admin.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
