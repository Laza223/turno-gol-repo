import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silueta real de `/settings/*` (ver settings/reservas/page.tsx): título, tira
 * de tabs y una card con el formulario de la sección. Cubre las 4 pantallas de
 * configuración que no declaran loading propio (perfil, reservas, horarios,
 * facturación); canchas y equipo tienen el suyo. `/settings/avisos` (H161) es
 * puro redirect a `/settings/perfil` — no llega a mostrar este skeleton.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-8 w-52" />

      {/* SettingsTabs: 5 tabs (H161 plegó Avisos en Perfil; Canchas salió del menú de Configuración) */}
      <div className="flex gap-1 border-b border-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-24 shrink-0 rounded-none" />
        ))}
      </div>

      <div className="card-premium rounded-lg p-6 space-y-6">
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-10 w-full max-w-md rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  )
}
