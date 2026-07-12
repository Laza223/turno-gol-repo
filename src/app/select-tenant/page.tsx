import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { resolveStaffTenants } from '@/modules/auth/auth.service'
import { selectTenantAction } from './actions'
import { SelectTenantList } from './SelectTenantList'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Elegí tu complejo — TurnoGol',
  robots: { index: false, follow: false },
}

type Props = {
  searchParams: { error?: string }
}

export default async function SelectTenantPage({ searchParams }: Props) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenants = await resolveStaffTenants(user.staffUserId)
  if (tenants.length === 0) redirect('/onboarding')

  return <SelectTenantList tenants={tenants} error={searchParams.error} action={selectTenantAction} />
}
