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
import { StockLedgerList, lastMovementSummary } from './StockLedgerList'
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
      {/* MASTER §6.8: la vista no abre encabezado propio — ver settings/perfil. */}
      <CajaTabs active="/caja/productos" />

      {/* Catálogo y "qué se vende", lado a lado. El informe deja de estar
          plegado: la pregunta que trae al dueño a esta pantalla una vez por
          semana es justamente "¿qué sale y qué no?", y tenerla detrás de un
          click la dejaba sin respuesta visible. El catálogo manda en ancho
          porque es donde se actúa. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
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
      </div>

      {/* El ledger sí se queda plegado: es trazabilidad, se consulta cuando un
          número no cierra. El encabezado dice el último movimiento para saber,
          sin abrirlo, si pasó algo desde la última vez. */}
      <Disclosure
        heading="Movimientos de stock"
        hint={
          lastMovementSummary(ledger) ??
          'Compras, ventas, fiados y mermas de cada producto, con su fecha.'
        }
        hideHintOnMobile
      >
        <StockLedgerList entries={ledger} />
      </Disclosure>
    </div>
  )
}
