import { AlertTriangle } from 'lucide-react'
import { stopImpersonationAction } from '@/app/(super-admin)/super-admin/tenants/[id]/actions'

/**
 * Banner rojo fijo de la sesión impersonada (spec §6). Recordatorio permanente
 * de que estás operando como soporte sobre otro complejo. El botón "Salir"
 * postea stopImpersonationAction (borra la cookie y vuelve al detalle del tenant).
 *
 * Server component: el form usa directamente la Server Action, sin JS de cliente.
 */
export function ImpersonationBanner({ tenantName }: { tenantName: string }) {
  return (
    <div
      role="alert"
      className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 flex items-center gap-3 border-b border-red-800 bg-red-600 px-4 py-2 text-sm text-white shadow-md"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 font-semibold">
        Impersonando {tenantName} — todas las acciones se auditan como super admin.
      </span>
      <form action={stopImpersonationAction}>
        <button
          type="submit"
          className="rounded-md bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-white/40 transition-colors hover:bg-white/25"
        >
          Salir de impersonación
        </button>
      </form>
    </div>
  )
}
