'use client'

import { Building2 } from 'lucide-react'
import { useActionState, useEffect, useRef } from 'react'
import type { StaffTenantRow } from '@/modules/auth/auth.service'
import type { SelectTenantState } from './actions'

/** Firma de la Server Action que consume el form (llega por PROP, no por
 * import: './actions' es `'use server'` y arrastra `node:async_hooks`, que
 * rompe cualquier bundle de browser si se importa como valor — mismo motivo
 * que LoginCard.tsx / reset-form.tsx). */
export type SelectTenantAction = (
  prevState: SelectTenantState,
  formData: FormData,
) => Promise<SelectTenantState>

type Props = {
  tenants: StaffTenantRow[]
  /** `?error=invalid` — tenantId manipulado o el staff ya no pertenece a ese tenant. */
  error?: string
  action: SelectTenantAction
}

const initial: SelectTenantState = { status: 'idle' }

/**
 * Selector de complejo para staff con acceso a más de uno (`resolveStaffTenants`
 * devuelve N>1 filas). Cada fila es un `<form>` propio, todas comparten el
 * mismo `formAction` de `useActionState`.
 */
export function SelectTenantList({ tenants, error, action }: Props) {
  const [state, formAction] = useActionState(action, initial)

  // Navegación completa, no redirect() server-side — ver actions.ts.
  const navigatedRef = useRef(false)
  useEffect(() => {
    if (state.status === 'success' && !navigatedRef.current) {
      navigatedRef.current = true
      window.location.assign(state.path)
    }
  }, [state])

  const isNavigating = state.status === 'success'

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
          <Building2
            className="h-6 w-6 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
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
            <form action={formAction}>
              <input type="hidden" name="tenantId" value={t.tenantId} />
              <button
                type="submit"
                disabled={isNavigating}
                className="card-premium card-premium-interactive flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition hover:border-emerald-300 dark:hover:border-emerald-500/40 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <span>
                  <span className="block text-sm font-semibold text-foreground">
                    {t.tenantName}
                  </span>
                  <span className="block text-xs text-muted-foreground">/{t.tenantSlug}</span>
                </span>
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Entrar →
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  )
}
