import Link from 'next/link'
import { withTenantContext } from '@/shared/db/client'
import { getCashFlows, getDaySummary } from '@/modules/cashflow/cashflow.service'
import { getStreetMoney, sumStreetMoney } from '@/modules/cashflow/street-money.service'
import {
  DEFAULT_STREET_MONEY_WINDOW,
  STREET_MONEY_DEFAULT_MONTHS,
} from '@/modules/cashflow/street-money-window'
import { lowStockCount } from '@/modules/canteen/canteen.service'
import { listPendingRefunds } from '@/modules/payments/refund.service'
import { track } from '@/shared/observability/breadcrumbs'
import { formatArs } from '@/lib/format'
import { Pager } from '@/components/ui/pager'
import { CajaTabs } from '../components/CajaTabs'
import { AddMovementButton } from '../cantina/AddMovementButton'
import { MovementsList } from '../cantina/MovementsList'
import { StreetMoneyList } from '../deudas/StreetMoneyList'
import { PendingRefundsList } from '../devoluciones/PendingRefundsList'
import { markRefundSettledAction } from '../devoluciones/actions'
import { createCashFlowAction } from '../actions'
import { requireCajaContext } from '../queries'
import { operatingDayLabel } from '../caja-lib'

/** Movimientos del día por página. Mismo número que las deudas de al lado. */
const MOVEMENTS_PAGE_SIZE = 25

/** `?mov=` es 1-based en la URL (igual que `?pagina=` de /jugadores). Basura → 1. */
function parseMovementsPage(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 1 ? n - 1 : 0
}

/**
 * Cuentas: el libro del complejo. Quién te debe, qué señas debés y qué pasó
 * hoy con la plata.
 *
 * Reemplaza a las pestañas Deudas y Devoluciones, que eran dos URLs para la
 * misma pregunta —"¿qué plata está pendiente?"— mirada desde los dos lados. Se
 * muestran como DOS listas con DOS totales, nunca como un neto: lo que te
 * deben y lo que debés son direcciones opuestas, y restarlas rompería el
 * invariante de fuente única del total de "Deudas".
 *
 * Deudas a la izquierda y el diario del día a la derecha, las dos visibles sin
 * scrollear en escritorio: son las dos preguntas con las que el dueño entra
 * acá. "Tenés que devolver" no tiene lugar fijo: aparece arriba, a lo ancho,
 * solo cuando hay algo que devolver (ver PendingRefundsList).
 *
 * Siempre "hoy": esta pantalla no navega por fecha. El día es el OPERATIVO del
 * complejo (`cutoffMins`), no el calendario.
 */
export default async function CajaCuentasPage(props: {
  searchParams: Promise<{ todas?: string; mov?: string }>
}) {
  const { tenant, cutoffMins, today } = await requireCajaContext()
  const searchParams = await props.searchParams

  // B11: por defecto los últimos 12 meses. La deuda vieja NO desaparece ni deja
  // de deberse — `?todas=1` la trae entera. Ver street-money-window.ts.
  const showAll = searchParams.todas === '1'
  const window = showAll ? 'all' : DEFAULT_STREET_MONEY_WINDOW
  const movPage = parseMovementsPage(searchParams.mov)

  const { summary, cashFlows, streetMoneyRows, refunds, lowStock } = await withTenantContext(
    tenant.id,
    async (tx) => {
      const [s, cf, sm, rf, ls] = await Promise.all([
        getDaySummary(tenant.id, today, cutoffMins, tx),
        // `limit + 1`: la fila sobrante es `hasMore`, sin un COUNT aparte.
        getCashFlows(tenant.id, today, cutoffMins, tx, {
          limit: MOVEMENTS_PAGE_SIZE + 1,
          offset: movPage * MOVEMENTS_PAGE_SIZE,
        }),
        getStreetMoney(tenant.id, tx, window),
        listPendingRefunds(tenant.id, tx),
        // Cuentas no carga el catálogo: el aviso de stock sale de un COUNT.
        lowStockCount(tenant.id, tx),
      ])
      return { summary: s, cashFlows: cf, streetMoneyRows: sm, refunds: rf, lowStock: ls }
    },
  )

  const movHasMore = cashFlows.length > MOVEMENTS_PAGE_SIZE
  const movRows = cashFlows.slice(0, MOVEMENTS_PAGE_SIZE)

  // Único uso: la instrumentación de abajo. La propia StreetMoneyList calcula
  // este mismo total sobre las MISMAS filas para su encabezado — no hay dos cuentas.
  const streetMoneyCents = sumStreetMoney(streetMoneyRows)

  // Proxy "plata en la calle: tendencia ↓ por tenant" (§11) — misma fuente que
  // la pantalla, así que el dato instrumentado nunca puede divergir del que se ve.
  track.cashflow('street_money.viewed', { tenantId: tenant.id, totalCents: streetMoneyCents })

  /**
   * La URL de Cuentas con los dos estados de la pantalla: la ventana de deuda
   * (`?todas=1`) y la página del diario (`?mov=`). Cambiar uno no resetea el
   * otro — son dos listas independientes, una al lado de la otra.
   */
  function cuentasHref({ all = showAll, mov = movPage }: { all?: boolean; mov?: number }) {
    const qs = new URLSearchParams()
    if (all) qs.set('todas', '1')
    if (mov > 0) qs.set('mov', String(mov + 1))
    const s = qs.toString()
    return s ? `/caja/cuentas?${s}` : '/caja/cuentas'
  }
  const movHref = (page: number) => cuentasHref({ mov: page })

  return (
    <div className="space-y-8">
      {/* La barra superior queda con los tres destinos y nada más. "Cobrado
          hoy", el día y el alta de movimiento bajaron al encabezado del diario:
          ahí el número tiene contexto y el botón queda al lado de la lista que
          alimenta (feedback del dueño, 2026-09-17: arriba "no se percibe y no
          se entiende qué hace"). */}
      <CajaTabs active="/caja/cuentas" lowStock={lowStock} />

      <PendingRefundsList rows={refunds} action={markRefundSettledAction} />

      <div className="grid grid-cols-1 items-start gap-x-8 gap-y-10 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <StreetMoneyList rows={streetMoneyRows} />

          {/* El rótulo dice qué se está viendo SIEMPRE, no solo cuando hay algo
              escondido: una pantalla de plata que muestra una ventana sin
              decirlo se lee como "esto es todo lo que me deben". */}
          <p className="text-sm text-muted-foreground">
            {showAll ? (
              <>
                Mostrando <strong className="text-foreground">toda</strong> la deuda registrada.{' '}
                <Link
                  href={cuentasHref({ all: false })}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Ver solo los últimos {STREET_MONEY_DEFAULT_MONTHS} meses
                </Link>
              </>
            ) : (
              <>
                Mostrando los últimos{' '}
                <strong className="text-foreground">{STREET_MONEY_DEFAULT_MONTHS} meses</strong>.{' '}
                <Link
                  href={cuentasHref({ all: true })}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Ver deuda anterior
                </Link>
              </>
            )}
          </p>
        </div>

        <MovementsList
          cashFlows={movRows}
          meta={
            <>
              {operatingDayLabel(today, cutoffMins)} · Cobrado{' '}
              <span className="font-semibold text-foreground">{formatArs(summary.collected)}</span>
            </>
          }
          actions={
            <AddMovementButton
              variant="outline"
              label="Registrar movimiento"
              date={today}
              cutoffMins={cutoffMins}
              createCashFlowAction={createCashFlowAction}
            />
          }
          // Página fuera de rango (`?mov=9` de un link viejo): no es "sin
          // movimientos", es "esa página no existe" — decir lo primero con el
          // día lleno de cobros sería mentir.
          {...(movPage > 0 && movRows.length === 0
            ? {
                emptyTitle: 'Esa página no existe',
                emptyDescription: 'El día tiene menos movimientos que los que pide el link.',
                emptyAction: (
                  <Link
                    href={movHref(0)}
                    className="text-sm font-medium underline underline-offset-4"
                  >
                    Volver al principio
                  </Link>
                ),
              }
            : {})}
          footer={
            <Pager
              label="Paginación de movimientos del día"
              page={movPage}
              hasMore={movHasMore}
              hrefFor={movHref}
            />
          }
        />
      </div>
    </div>
  )
}
