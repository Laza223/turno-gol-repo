import { withTenantContext } from '@/shared/db/client'
import { listProducts } from '@/modules/canteen/canteen.service'
import { countLedger, getLedger } from '@/modules/canteen/stock.service'
import { getSalesRanking } from '@/modules/canteen/canteen-report.service'
import { Pager } from '@/components/ui/pager'
import { CajaTabs } from '../components/CajaTabs'
import { Disclosure } from '../components/Disclosure'
import { addDays, countLowStock } from '../caja-lib'
import { requireCajaContext } from '../queries'
import { ProductsTable } from './ProductsTable'
import { StockLedgerList, lastMovementSummary } from './StockLedgerList'
import { TopSellers } from './TopSellers'
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

/**
 * Productos: lo semanal de la cantina, en tarjetas como Cuentas (variante
 * "Reponer primero", elegida por el dueño el 2026-09-26,
 * `docs/decisions/2026-09-26-caja-productos-reponer-primero.md`).
 *
 * Arriba, lo que hay que reponer y para cuántas noches alcanza. Después, el
 * catálogo con lo que más salió al lado. Abajo, plegados, los movimientos de
 * stock: trazabilidad para cuando un número no cierra.
 */
export default async function CajaProductosPage(props: {
  searchParams: Promise<{ configureCanteen?: string; range?: string; stock?: string }>
}) {
  const searchParams = await props.searchParams
  // Rango de "Lo que más salió": solo 7 o 30 días — cualquier otro valor
  // (basura, ausente) degrada a 7.
  const range: 7 | 30 = searchParams.range === '30' ? 30 : 7
  const ledgerPage = parseLedgerPage(searchParams.stock)

  // `role` viene del contexto de Caja, que ya lo leyó en su guard.
  const { tenant, role, cutoffMins, today } = await requireCajaContext()

  const weekRange = { from: addDays(today, -6), to: today }
  const reportRange = range === 7 ? weekRange : { from: addDays(today, -29), to: today }

  const { products, ledgerRows, ledgerTotal, ranking, weekRanking } = await withTenantContext(
    tenant.id,
    async (tx) => {
      const [p, l, n, rk, wk] = await Promise.all([
        listProducts(tenant.id, tx, { includeInactive: true }),
        getLedger(tenant.id, tx, {
          limit: LEDGER_PAGE_SIZE,
          offset: ledgerPage * LEDGER_PAGE_SIZE,
        }),
        // El total del paginador: el primer movimiento de todos queda a un clic.
        countLedger(tenant.id, tx),
        getSalesRanking(tenant.id, tx, reportRange, cutoffMins),
        // "Para reponer" mide el ritmo siempre sobre la última semana, aunque
        // el informe muestre 30 días. Con 7 es el mismo ranking.
        range === 7 ? null : getSalesRanking(tenant.id, tx, weekRange, cutoffMins),
      ])
      return { products: p, ledgerRows: l, ledgerTotal: n, ranking: rk, weekRanking: wk ?? rk }
    },
  )

  const unitsLast7Days = Object.fromEntries(weekRanking.map((r) => [r.productId, r.units]))

  function ledgerHref(page: number): string {
    const qs = new URLSearchParams()
    if (range === 30) qs.set('range', '30')
    if (page > 0) qs.set('stock', String(page + 1))
    const s = qs.toString()
    return s ? `/caja/productos?${s}` : '/caja/productos'
  }

  return (
    <div className="space-y-5">
      {/* MASTER §6.8: la vista no abre encabezado propio — ver settings/perfil. */}
      <CajaTabs active="/caja/productos" lowStock={countLowStock(products)} />

      <ProductsTable
        products={products}
        unitsLast7Days={unitsLast7Days}
        canEditCatalog={role === 'admin'}
        createProductAction={createProductAction}
        updateProductAction={updateProductAction}
        deactivateProductAction={deactivateProductAction}
        registerPurchaseAction={registerPurchaseAction}
        registerStockExitAction={registerStockExitAction}
        aside={<TopSellers range={range} ranking={ranking} />}
      />

      {/* El ledger se queda plegado: es trazabilidad, se consulta cuando un
          número no cierra (en el piloto, 322 de 324 movimientos eran ventas,
          que ya cuenta Cuentas). Paginado de a 20; con `?stock=` en la URL
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
