import { redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { listTenantClients } from './queries'
import { JugadoresView } from './JugadoresView'
import { linkContactAction, searchLinkCandidatesAction } from './actions'

/** `?pagina=` es 1-based en la URL y 0-based adentro. Basura → página 1. */
function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 1 ? n - 1 : 0
}

export default async function JugadoresPage(props: {
  searchParams: Promise<{ q?: string; pagina?: string }>
}) {
  const searchParams = await props.searchParams
  // Constraint: el módulo se protege con requireOperatorStaff (admin + manager).
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/dashboard')
  const { tenant } = auth

  const q = searchParams.q?.trim() || undefined
  const page = parsePage(searchParams.pagina)
  const { rows, hasMore } = await withTenantContext(tenant.id, (tx) =>
    listTenantClients(tenant.id, { q }, tx, page),
  )

  return (
    <JugadoresView
      clients={rows}
      q={q}
      page={page}
      hasMore={hasMore}
      searchAction={searchLinkCandidatesAction}
      linkAction={linkContactAction}
    />
  )
}
