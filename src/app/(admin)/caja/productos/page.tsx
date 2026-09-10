import { Banknote } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { withTenantContext } from '@/shared/db/client'
import { listProducts } from '@/modules/canteen/canteen.service'
import { getLedger } from '@/modules/canteen/stock.service'
import {
  getCanteenDailyTotals,
  getCanteenTotalsByMethod,
  getSalesRanking,
} from '@/modules/canteen/canteen-report.service'
import { CajaTabs } from '../components/CajaTabs'
import { Disclosure } from '../components/Disclosure'
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

  // `role` viene del contexto de Caja, que ya lo leyó en su guard: antes esta
  // página pedía un `getStaffRole` propio en paralelo, sobre la misma fila de
  // `tenant_staff_members` que el guard acababa de mirar.
  const { tenant, role, cutoffMins, today } = await requireCajaContext()

  const reportRange = { from: addDays(today, -(range - 1)), to: today }

  const { products, ledger, ranking, byMethod, daily } = await withTenantContext(
    tenant.id,
    async (tx) => {
      const [p, l, rk, bm, dl] = await Promise.all([
        listProducts(tenant.id, tx, { includeInactive: true }),
        getLedger(tenant.id, tx, { limit: 20 }),
        getSalesRanking(tenant.id, tx, reportRange, cutoffMins),
        getCanteenTotalsByMethod(tenant.id, tx, reportRange, cutoffMins),
        getCanteenDailyTotals(tenant.id, tx, reportRange, cutoffMins),
      ])
      return { products: p, ledger: l, ranking: rk, byMethod: bm, daily: dl }
    },
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos y stock"
        subtitle="Catálogo, stock y reporte de la cantina."
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

      {/* El catálogo de arriba es lo operativo; estos cuatro informes (ranking,
          cobrado por método, por día, movimientos de stock) son ocasionales —
          plegados por defecto para que el catálogo sea lo único visible sin
          scrollear (H003, auditoría de coherencia 2026-09-09 §11). */}
      <Disclosure
        heading="Informes de ventas y stock"
        hint="Ranking de productos, cobrado por método, por día y movimientos de stock."
      >
        <div className="space-y-6">
          <CanteenReport range={range} ranking={ranking} byMethod={byMethod} daily={daily} />
          <StockLedgerList entries={ledger} />
        </div>
      </Disclosure>
    </div>
  )
}
