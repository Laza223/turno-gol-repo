import { redirect } from 'next/navigation'
import { Banknote } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { listProducts } from '@/modules/canteen/canteen.service'
import { getLedger } from '@/modules/canteen/stock.service'
import { CajaTabs } from '../components/CajaTabs'
import { ProductsTable } from './ProductsTable'
import { StockLedgerList } from './StockLedgerList'
import {
  createProductAction,
  updateProductAction,
  deactivateProductAction,
  registerPurchaseAction,
  registerStockExitAction,
} from './actions'

export default async function CajaProductosPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const [role, { products, ledger }] = await Promise.all([
    getStaffRole(tenant.id, user.staffUserId),
    withTenantContext(tenant.id, async (tx) => {
      const [p, l] = await Promise.all([
        listProducts(tenant.id, tx, { includeInactive: true }),
        getLedger(tenant.id, tx, { limit: 20 }),
      ])
      return { products: p, ledger: l }
    }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja y Cantina"
        subtitle="Productos y stock de la cantina"
        icon={<Banknote className="h-6 w-6" aria-hidden="true" />}
      />

      <CajaTabs active="/caja/productos" />

      <ProductsTable
        products={products}
        canEditCatalog={role === 'admin'}
        createProductAction={createProductAction}
        updateProductAction={updateProductAction}
        deactivateProductAction={deactivateProductAction}
        registerPurchaseAction={registerPurchaseAction}
        registerStockExitAction={registerStockExitAction}
      />

      <StockLedgerList entries={ledger} />
    </div>
  )
}
