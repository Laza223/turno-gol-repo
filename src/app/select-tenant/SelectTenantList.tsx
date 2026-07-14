import { Building2 } from 'lucide-react'
import type { StaffTenantRow } from '@/modules/auth/auth.service'

type Props = {
  tenants: StaffTenantRow[]
  /** `?error=invalid` — tenantId manipulado o el staff ya no pertenece a ese tenant. */
  error?: string
  /** `selectTenantAction` (Server Action real, `'use server'`) inyectada por `page.tsx`. */
  action: (formData: FormData) => Promise<void>
}

/**
 * Selector de complejo para staff con acceso a más de uno (`resolveStaffTenants`
 * devuelve N>1 filas). Cada fila es un `<form>` propio — sin JS, submit real.
 */
export function SelectTenantList({ tenants, error, action }: Props) {
  return (
    <section className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
          <Building2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Elegí tu complejo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tu cuenta tiene acceso a más de un complejo. Seleccioná con cuál querés trabajar.
        </p>
      </div>

      {error === 'invalid' && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-600/20 dark:ring-red-500/30"
        >
          No pudimos seleccionar ese complejo. Probá de nuevo.
        </p>
      )}

      <ul className="space-y-3">
        {tenants.map((t) => (
          <li key={t.tenantId}>
            <form action={action}>
              <input type="hidden" name="tenantId" value={t.tenantId} />
              <button
                type="submit"
                className="card-premium card-premium-interactive flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-500/40 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <span>
                  <span className="block text-sm font-semibold text-foreground">{t.tenantName}</span>
                  <span className="block text-xs text-muted-foreground">/{t.tenantSlug}</span>
                </span>
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Entrar →</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  )
}
