import { redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { listTenantPlayers } from './queries'
import { JugadoresView } from './JugadoresView'

export default async function JugadoresPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  // Constraint: el módulo se protege con requireOperatorStaff (admin + manager).
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/dashboard')
  const { tenant } = auth

  const q = searchParams.q?.trim() || undefined
  const players = await withTenantContext(tenant.id, (tx) =>
    listTenantPlayers(tenant.id, { q }, tx),
  )

  return <JugadoresView players={players} q={q} />
}
