import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getDebts } from '../../deudas/queries'
import { DebtListClient } from '../../deudas/DebtListClient'
import { JugadoresTabs } from '../JugadoresTabs'
import { Contact } from 'lucide-react'

export default async function JugadoresDeudasPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const debts = await withTenantContext(tenant.id, (tx) => getDebts(tenant.id, tx))

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Jugadores"
        subtitle="Gestión de deudas y saldos pendientes por cobrar."
        icon={<Contact className="h-6 w-6" aria-hidden="true" />}
      />

      <JugadoresTabs active="/jugadores/deudas" />

      <DebtListClient debts={debts} />
    </div>
  )
}
