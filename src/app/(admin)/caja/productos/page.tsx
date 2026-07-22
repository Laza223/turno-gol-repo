import { redirect } from 'next/navigation'
import { Banknote } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { CajaTabs } from '../components/CajaTabs'
import { saveCanteenProductsAction } from '../actions'
import { ProductsManager } from './ProductsManager'

export default async function CajaProductosPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja y Cantina"
        subtitle="Productos y stock de la cantina"
        icon={<Banknote className="h-6 w-6" aria-hidden="true" />}
      />

      <CajaTabs active="/caja/productos" />

      <ProductsManager
        products={tenant.settings.canteen_products ?? []}
        saveCanteenProductsAction={saveCanteenProductsAction}
      />
    </div>
  )
}
