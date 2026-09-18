import { withTenantContext } from '@/shared/db/client'
import { listProducts } from '@/modules/canteen/canteen.service'
import { countLedger, getLedger } from '@/modules/canteen/stock.service'
import {
  getCanteenDailyTotals,
  getCanteenTotalsByMethod,
  getSalesRanking,
} from '@/modules/canteen/canteen-report.service'
import { Pager } from '@/components/ui/pager'
import { CajaTabs } from '../components/CajaTabs'
import { Disclosure } from '../components/Disclosure'
import { addDays, countLowStock } from '../caja-lib'
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

/** Movimientos de stock por página. */
const LEDGER_PAGE_SIZE = 20

/** `?stock=` es 1-based en la URL. Basura → 1. */
function parseLedgerPage(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 1 ? n - 1 : 0
}

export default async function CajaProductosPage(props: {
  searchParams: Promise<{ configureCanteen?: string; range?: string; stock?: string }>
}) {
  const searchParams = await props.searchParams
  // Rango del reporte (Fase 7): solo 7 o 30 días — cualquier otro valor
  // (basura, ausente) degrada a 7.
  const range: 7 | 30 = searchParams.range === '30' ? 30 : 7
  const ledgerPage = parseLedgerPage(searchParams.stock)

  // `role` viene del contexto de Caja, que ya lo leyó en su guard.
  const { tenant, role, cutoffMins, today } = await requireCajaContext()

  const reportRange = { from: addDays(today, -(range - 1)), to: today }

  const { products, ledgerRows, ledgerTotal, ranking, byMethod, daily } = await withTenantContext(
    tenant.id,
    async (tx) => {
      const [p, l, n, rk, bm, dl] = await Promise.all([
        listProducts(tenant.id, tx, { includeInactive: true }),
        getLedger(tenant.id, tx, {
          limit: LEDGER_PAGE_SIZE,
          offset: ledgerPage * LEDGER_PAGE_SIZE,
        }),
        // El total del paginador: el primer movimiento de todos queda a un clic.
        countLedger(tenant.id, tx),
        getSalesRanking(tenant.id, tx, reportRange, cutoffMins),
        getCanteenTotalsByMethod(tenant.id, tx, reportRange, cutoffMins),
        getCanteenDailyTotals(tenant.id, tx, reportRange, cutoffMins),
      ])
      return {
        products: p,
        ledgerRows: l,
        ledgerTotal: n,
        ranking: rk,
        byMethod: bm,
        daily: dl,
      }
    },
  )

  function ledgerHref(page: number): string {
    const qs = new URLSearchParams()
    if (range === 30) qs.set('range', '30')
    if (page > 0) qs.set('stock', String(page + 1))
    const s = qs.toString()
    return s ? `/caja/productos?${s}` : '/caja/productos'
  }

  return (
    <div className="space-y-8">
      {/* MASTER §6.8: la vista no abre encabezado propio — ver settings/perfil. */}
      <CajaTabs active="/caja/productos" lowStock={countLowStock(products)} />

      {/* Catálogo y "qué se vende", lado a lado. El informe queda desplegado:
          la pregunta que trae al dueño acá una vez por semana es "¿qué sale y
          qué no?". El catálogo manda en ancho porque es donde se actúa. */}
      <div className="grid grid-cols-1 items-start gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
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
          número no cierra. Paginado de a 20: antes eran los últimos 20 y lo
          anterior no se podía ver desde ningún lado. Con `?stock=` en la URL
          arranca abierto, así el "Siguientes" no te devuelve a un bloque
          cerrado. El resumen del encabezado habla del ÚLTIMO movimiento, así
          que solo se arma con la primera página. */}
      <Disclosure
        heading="Movimientos de stock"
        hint={
          (ledgerPage === 0 ? lastMovementSummary(ledgerRows) : null) ??
          'Compras, ventas, fiados y mermas de cada producto, con su fecha.'
        }
        hideHintOnMobile
        defaultOpen={ledgerPage > 0}
      >
        <StockLedgerList
          entries={ledgerRows}
          footer={
            ledgerRows.length > 0 && (
              <Pager
                label="Paginación de movimientos de stock"
                page={ledgerPage}
                total={ledgerTotal}
                pageSize={LEDGER_PAGE_SIZE}
                shown={ledgerRows.length}
                hrefFor={ledgerHref}
              />
            )
          }
        />
      </Disclosure>
    </div>
  )
}
