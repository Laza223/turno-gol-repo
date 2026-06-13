import Link from 'next/link'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import {
  isTenantStatus,
  listActivePlans,
  listTenants,
  TENANT_STATUSES,
} from '@/modules/super-admin/tenants.service'
import type { TenantStatus } from '@/modules/billing/billing.types'
import { formatArs } from '@/lib/format'
import { TenantStatusBadge } from './_components/status-badge'
import { formatDateArt } from './_components/format'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

const STATUS_LABELS: Record<TenantStatus, string> = {
  trialing: 'Trial',
  active: 'Activo',
  past_due: 'Pago vencido',
  suspended: 'Suspendido',
  blocked: 'Bloqueado',
  canceled: 'Cancelado',
  churned: 'Churned',
  deleted: 'Eliminado',
}

type SearchParams = {
  q?: string
  status?: string
  plan?: string
  page?: string
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : 1
}

function buildQuery(params: SearchParams, overrides: Record<string, string | undefined>): string {
  const merged: Record<string, string | undefined> = {
    q: params.q,
    status: params.status,
    plan: params.plan,
    page: params.page,
    ...overrides,
  }
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(merged)) {
    if (v) sp.set(k, v)
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export default async function SuperAdminTenantsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireSystemAdmin()

  const q = searchParams.q?.trim() || undefined
  const status = searchParams.status && isTenantStatus(searchParams.status)
    ? searchParams.status
    : undefined
  const page = parsePage(searchParams.page)

  const plansList = await listActivePlans()
  const planSlug = plansList.some((p) => p.slug === searchParams.plan)
    ? searchParams.plan
    : undefined

  const result = await listTenants({ q, status, planSlug, page, pageSize: PAGE_SIZE })
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Tenants</h1>
        <p className="text-sm text-slate-500">
          {result.total} complejo{result.total === 1 ? '' : 's'} — vista global de soporte
        </p>
      </div>

      {/* Filtros GET (sin client state): búsqueda + status + plan. */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-sm font-medium text-slate-700">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q ?? ''}
            placeholder="Nombre, slug o email"
            className="h-10 w-64 rounded-md border border-slate-200 px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-sm font-medium text-slate-700">
            Estado
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ''}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Todos</option>
            {TENANT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="plan" className="text-sm font-medium text-slate-700">
            Plan
          </label>
          <select
            id="plan"
            name="plan"
            defaultValue={planSlug ?? ''}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Todos</option>
            {plansList.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-emerald-700"
        >
          Filtrar
        </button>
        {(q || status || planSlug) && (
          <Link
            href="/super-admin/tenants"
            className="flex h-10 items-center rounded-md px-3 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            Limpiar
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[880px] text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3 text-right">MRR</th>
              <th className="px-4 py-3">Fin de trial</th>
              <th className="px-4 py-3">Creado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-900">
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  No hay tenants que coincidan con los filtros.
                </td>
              </tr>
            )}
            {result.rows.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/super-admin/tenants/${t.id}`}
                    className="text-slate-900 hover:text-emerald-700 hover:underline"
                  >
                    {t.name}
                  </Link>
                  <div className="text-xs font-normal text-slate-500">{t.email}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{t.slug}</td>
                <td className="px-4 py-3">
                  <TenantStatusBadge status={t.status} />
                </td>
                <td className="px-4 py-3 text-slate-600">{t.planName ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {t.mrrCents > 0 ? formatArs(t.mrrCents) : '—'}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-600">
                  {formatDateArt(t.trialEndsAt)}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-600">
                  {formatDateArt(t.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav aria-label="Paginación" className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Página {result.page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link
                href={`/super-admin/tenants${buildQuery(searchParams, { page: String(result.page - 1) })}`}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                Anterior
              </Link>
            ) : (
              <span className="rounded-md border border-slate-100 px-3 py-1.5 text-slate-300">
                Anterior
              </span>
            )}
            {result.page < totalPages ? (
              <Link
                href={`/super-admin/tenants${buildQuery(searchParams, { page: String(result.page + 1) })}`}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                Siguiente
              </Link>
            ) : (
              <span className="rounded-md border border-slate-100 px-3 py-1.5 text-slate-300">
                Siguiente
              </span>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}
