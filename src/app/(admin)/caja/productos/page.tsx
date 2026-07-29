import { Banknote } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { listProducts } from '@/modules/canteen/canteen.service'
import { getLedger } from '@/modules/canteen/stock.service'
import {
  getCanteenDailyTotals,
  getCanteenTotalsByMethod,
  getSalesRanking,
} from '@/modules/canteen/canteen-report.service'
import { CajaTabs } from '../components/CajaTabs'
import { addDays } from '../caja-lib'
import { requireCajaContext } from '../queries'
import { CanteenReport } from './CanteenReport'
import { ProductsTable } from './ProductsTable'
import { StockLedgerList } from './StockLedgerList'
import {
  createProductAction,
  updateProductAction,
  deactivateProductAction,
  registerPurchaseAction,
  registerStockExitAction,
} from './actions'

export default async function CajaProductosPage(props: {
  searchParams: Promise<{ configureCanteen?: string; range?: string }>
}) {
  const searchParams = await props.searchParams
  // Rango del reporte (Fase 7): solo 7 o 30 días — cualquier otro valor
  // (basura, ausente) degrada a 7.
  const range: 7 | 30 = searchParams.range === '30' ? 30 : 7

  const { tenant, staffUserId, cutoffMins, today } = await requireCajaContext()

  const reportRange = { from: addDays(today, -(range - 1)), to: today }

  const [role, { products, ledger, ranking, byMethod, daily }] = await Promise.all([
    getStaffRole(tenant.id, staffUserId),
    withTenantContext(tenant.id, async (tx) => {
      const [p, l, rk, bm, dl] = await Promise.all([
        listProducts(tenant.id, tx, { includeInactive: true }),
        getLedger(tenant.id, tx, { limit: 20 }),
        getSalesRanking(tenant.id, tx, reportRange, cutoffMins),
        getCanteenTotalsByMethod(tenant.id, tx, reportRange, cutoffMins),
        getCanteenDailyTotals(tenant.id, tx, reportRange, cutoffMins),
      ])
      return { products: p, ledger: l, ranking: rk, byMethod: bm, daily: dl }
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

      <CanteenReport range={range} ranking={ranking} byMethod={byMethod} daily={daily} />

      <StockLedgerList entries={ledger} />
    </div>
  )
}
