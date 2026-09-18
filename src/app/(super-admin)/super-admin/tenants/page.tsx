import { Building2 } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import { isTenantStatus, listActivePlans, listTenants } from '@/modules/super-admin/tenants.service'
import { TenantsFilters } from './_components/tenants-filters'
import { TenantsTable } from './_components/tenants-table'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

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

export default async function SuperAdminTenantsPage(props: {
  searchParams: Promise<SearchParams>
}) {
  const searchParams = await props.searchParams
  await requireSystemAdmin()

  const q = searchParams.q?.trim() || undefined
  const status =
    searchParams.status && isTenantStatus(searchParams.status) ? searchParams.status : undefined
  const page = parsePage(searchParams.page)

  const plansList = await listActivePlans()
  const planSlug = plansList.some((p) => p.slug === searchParams.plan)
    ? searchParams.plan
    : undefined

  const result = await listTenants({ q, status, planSlug, page, pageSize: PAGE_SIZE })

  // El Pager trabaja en 0-based; la URL de esta pantalla sigue en 1-based.
  const tenantsHref = (p: number) =>
    `/super-admin/tenants${buildQuery(searchParams, { page: String(p + 1) })}`

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenants"
        subtitle={`${result.total} complejo${result.total === 1 ? '' : 's'} — vista global de soporte`}
        icon={
          <Building2 className="h-6 w-6 text-violet-600 dark:text-violet-400" aria-hidden="true" />
        }
      />

      <TenantsFilters q={q} status={status} planSlug={planSlug} plans={plansList} />

      <TenantsTable
        rows={result.rows}
        page={result.page - 1}
        total={result.total}
        pageSize={PAGE_SIZE}
        hrefFor={tenantsHref}
      />
    </div>
  )
}
