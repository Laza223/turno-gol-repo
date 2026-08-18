'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { SupportActionResult } from '../actions'

/**
 * Firma de `startImpersonationAction` (../actions). La Server Action entra
 * por PROP, no por import: '../actions' es `'use server'` y arrastra
 * request-context → node:async_hooks, que Vite externaliza en el browser y
 * rompe la story (ver docs/storybook, regla 1). `import type` sí es seguro:
 * se borra en compilación.
 */
export type StartImpersonationAction = (tenantId: string) => Promise<SupportActionResult>

/**
 * "Entrar como este complejo" (spec §6). Dispara `action`, que setea la
 * cookie de impersonación y redirige a /dashboard. En éxito la action
 * redirige (no vuelve); solo manejamos el error.
 *
 * `ConfirmDialog` reemplaza `window.confirm()` nativo (🔴 auditoría
 * 2026-08-01 §4.7/§8: era la acción más sensible del panel con la
 * confirmación más débil) — misma gramática que el resto de la plataforma.
 */
export function ImpersonateButton({
  tenantId,
  tenantName,
  action,
}: {
  tenantId: string
  tenantName: string
  action: StartImpersonationAction
}) {
  const [open, setOpen] = useState(false)

  async function handleConfirm(): Promise<ActionResult | void> {
    const res = await action(tenantId)
    // Si la action redirigió, este código no corre. Solo llega acá en error.
    if (res && !res.success) return { success: false, error: res.error }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        Entrar como este complejo
      </button>
      <p className="text-xs text-muted-foreground">
        Abre el panel del complejo como soporte. Un banner rojo te recordará que estás impersonando;
        toda acción se audita como super admin.
      </p>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Entrar como "${tenantName}"`}
        consequences={[
          'Vas a operar el panel del complejo como si fueras su staff.',
          'Todas tus acciones quedan auditadas a tu nombre de super admin.',
        ]}
        confirmLabel="Entrar"
        cancelLabel="Cancelar"
        onConfirm={handleConfirm}
      />
    </div>
  )
}
