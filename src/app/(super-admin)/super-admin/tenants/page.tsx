import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { PageHeader } from '@/components/admin/PageHeader'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import { isTenantStatus, listTenants } from '@/modules/super-admin/tenants.service'
import { TenantsFilters } from './_components/tenants-filters'
import { TenantsTable } from './_components/tenants-table'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

type SearchParams = {
  q?: string
  status?: string
  page?: string
}

// Fuera del componente: el lint de pureza no deja llamar a Date.now() en el render.
function currentMs(): number {
  return Date.now()
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : 1
}

function buildQuery(params: SearchParams, overrides: Record<string, string | undefined>): string {
  const merged: Record<string, string | undefined> = {
    q: params.q,
    status: params.status,
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

export default async function SuperAdminTenantsPage(props: {
  searchParams: Promise<SearchParams>
}) {
  const searchParams = await props.searchParams
  await requireSystemAdmin()

  const q = searchParams.q?.trim() || undefined
  const status =
    searchParams.status && isTenantStatus(searchParams.status) ? searchParams.status : undefined
  const page = parsePage(searchParams.page)

  const result = await listTenants({ q, status, page, pageSize: PAGE_SIZE })

  // El Pager trabaja en 0-based; la URL de esta pantalla sigue en 1-based.
  const tenantsHref = (p: number) =>
    `/super-admin/tenants${buildQuery(searchParams, { page: String(p + 1) })}`

  return (
    <div className="space-y-3 lg:space-y-6">
      <PageHeader
        title="Complejos"
        subtitle={`${result.total} complejo${result.total === 1 ? '' : 's'}`}
        icon={
          <Building2
            className="h-6 w-6 text-emerald-700 dark:text-emerald-400"
            aria-hidden="true"
          />
        }
        actions={
          <Link href="/super-admin/tenants/nuevo" className={buttonVariants()}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Dar de alta
          </Link>
        }
      />

      <TenantsFilters q={q} status={status} />

      <TenantsTable
        rows={result.rows}
        page={result.page - 1}
        total={result.total}
        pageSize={PAGE_SIZE}
        hrefFor={tenantsHref}
        nowMs={currentMs()}
      />
    </div>
  )
}
