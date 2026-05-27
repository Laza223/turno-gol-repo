import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getAbonados } from '@/modules/abonados/abonado.service'
import { AbonadosList } from './AbonadosList'

export default async function AbonadosPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const abonados = await withTenantContext(tenant.id, (tx) =>
    getAbonados(tenant.id, {}, tx),
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Abonados</h1>
        <a
          href="/abonados/nuevo"
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          + Nuevo Abonado
        </a>
      </div>

      <AbonadosList abonados={abonados} />
    </div>
  )
}
