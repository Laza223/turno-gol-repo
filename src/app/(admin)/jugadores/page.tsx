import { redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { listTenantClients } from './queries'
import { JugadoresView } from './JugadoresView'
import { linkContactAction, searchLinkCandidatesAction } from './actions'

export default async function JugadoresPage(
  props: {
    searchParams: Promise<{ q?: string }>
  }
) {
  const searchParams = await props.searchParams;
  // Constraint: el módulo se protege con requireOperatorStaff (admin + manager).
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/dashboard')
  const { tenant } = auth

  const q = searchParams.q?.trim() || undefined
  const clients = await withTenantContext(tenant.id, (tx) =>
    listTenantClients(tenant.id, { q }, tx),
  )

  return (
    <JugadoresView
      clients={clients}
      q={q}
      searchAction={searchLinkCandidatesAction}
      linkAction={linkContactAction}
    />
  )
}
