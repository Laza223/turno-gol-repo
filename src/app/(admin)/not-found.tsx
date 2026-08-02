import Link from 'next/link'
import { Compass, LayoutDashboard } from 'lucide-react'

/**
 * Sin este archivo, `notFound()` en cualquier página de (admin) (jugadores,
 * reservas, torneos...) burbujea al `not-found.tsx` raíz — sale del shell,
 * pierde el sidebar, y un staff logueado lee "me echó del sistema" (🔴
 * auditoría 2026-08-01 §7). Este nests dentro de `AdminLayoutShell`, igual
 * que `(admin)/error.tsx`.
 */
export default function AdminNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-xs">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-muted ring-1 ring-inset ring-border">
          <Compass className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">No encontramos esto</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          La página que buscás no existe o fue movida. Verificá el link o volvé al dashboard.
        </p>
        <div className="mt-6">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            Ir al dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
