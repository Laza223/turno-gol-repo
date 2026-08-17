import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silueta real de `/settings/*` (ver settings/reservas/page.tsx): título, tira
 * de tabs y una card con el formulario de la sección. Cubre las 5 pantallas de
 * configuración que no declaran loading propio (perfil, reservas, horarios,
 * facturación, avisos); canchas y equipo tienen el suyo.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-8 w-52" />

      {/* SettingsTabs: 7 tabs */}
      <div className="flex gap-1 border-b border-border">
        {Array.from({ length: 7 }).map((_, i) => (
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
