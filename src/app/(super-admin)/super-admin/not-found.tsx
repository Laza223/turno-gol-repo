import Link from 'next/link'
import { Compass, ShieldCheck } from 'lucide-react'

/**
 * Mismo motivo que `(admin)/not-found.tsx`: sin esto, `notFound()` en
 * `tenants/[id]/page.tsx` saca al super admin del shell del panel (🔴
 * auditoría 2026-08-01 §7).
 */
export default function SuperAdminNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-xs">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-muted ring-1 ring-inset ring-border">
          <Compass className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">No encontramos esto</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          El tenant o la página que buscás no existe. Verificá el link o volvé al panel.
        </p>
        <div className="mt-6">
          <Link
            href="/super-admin"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Ir al panel
          </Link>
        </div>
      </div>
    </div>
  )
}
