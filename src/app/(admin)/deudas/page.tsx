import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getDebts } from './queries'
import { DebtListClient } from './DebtListClient'

export default async function DeudasPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const debts = await withTenantContext(tenant.id, (tx) => getDebts(tenant.id, tx))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestión de Deudas"
        subtitle="Listado de turnos finalizados que registran saldos pendientes por cobrar."
      />
      <DebtListClient debts={debts} />
    </div>
  )
}
