import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { withTenantContext } from '@/shared/db/client'
import { getCashFlows, getDaySummary } from '@/modules/cashflow/cashflow.service'
import { getStreetMoney, sumStreetMoney } from '@/modules/cashflow/street-money.service'
import {
  DEFAULT_STREET_MONEY_WINDOW,
  STREET_MONEY_DEFAULT_MONTHS,
} from '@/modules/cashflow/street-money-window'
import { listPendingRefunds } from '@/modules/payments/refund.service'
import { track } from '@/shared/observability/breadcrumbs'
import { CajaHeaderStats } from '../components/CajaHeaderStats'
import { CajaTabs } from '../components/CajaTabs'
import { AddMovementButton } from '../cantina/AddMovementButton'
import { MovementsList } from '../cantina/MovementsList'
import { StreetMoneyList } from '../deudas/StreetMoneyList'
import { PendingRefundsList } from '../devoluciones/PendingRefundsList'
import { markRefundSettledAction } from '../devoluciones/actions'
import { createCashFlowAction } from '../actions'
import { requireCajaContext } from '../queries'
import { operatingDayLabel } from '../caja-lib'

/**
 * Cuentas: el libro del complejo. Lo que entró hoy, quién te debe, qué señas
 * debés, y el diario del día.
 *
 * Reemplaza a las pestañas Deudas y Devoluciones, que eran dos URLs para la
 * misma pregunta —"¿qué plata está pendiente?"— mirada desde los dos lados. Se
 * muestran como DOS listas con DOS totales, nunca como un neto: lo que te
 * deben y lo que debés son direcciones opuestas, y restarlas rompería el
 * invariante de fuente única del total de "Deudas".
 *
 * También absorbe lo que vivía en la raíz de /caja y no era vender: los tres
 * totales, el desglose por método y los movimientos del día. Quien vende no
 * los mira, y ocupaban la mitad de la pantalla donde trabaja.
 *
 * Siempre "hoy": igual que Deudas y Devoluciones, esta pantalla no navega por
 * fecha. El día es el OPERATIVO del complejo (`cutoffMins`), no el calendario.
 */
export default async function CajaCuentasPage(props: {
  searchParams: Promise<{ todas?: string }>
}) {
  const { tenant, cutoffMins, today } = await requireCajaContext()
  const searchParams = await props.searchParams

  // B11: por defecto los últimos 12 meses. La deuda vieja NO desaparece ni deja
  // de deberse — `?todas=1` la trae entera. Ver street-money-window.ts.
  const showAll = searchParams.todas === '1'
  const window = showAll ? 'all' : DEFAULT_STREET_MONEY_WINDOW

  const { summary, cashFlows, streetMoneyRows, refunds } = await withTenantContext(
    tenant.id,
    async (tx) => {
      const [s, cf, sm, rf] = await Promise.all([
        getDaySummary(tenant.id, today, cutoffMins, tx),
        getCashFlows(tenant.id, today, cutoffMins, tx),
        getStreetMoney(tenant.id, tx, window),
        listPendingRefunds(tenant.id, tx),
      ])
      return { summary: s, cashFlows: cf, streetMoneyRows: sm, refunds: rf }
    },
  )

  // Los dos totales salen de las MISMAS filas que se listan abajo. La card y la
  // lista no pueden divergir porque no hay dos cuentas: hay una.
  const streetMoneyCents = sumStreetMoney(streetMoneyRows)
  const pendingRefundsCents = refunds.reduce((acc, r) => acc + r.amountCents, 0)

  // Proxy "plata en la calle: tendencia ↓ por tenant" (§11) — misma fuente que
  // la pantalla, así que el dato instrumentado nunca puede divergir del que se ve.
  track.cashflow('street_money.viewed', { tenantId: tenant.id, totalCents: streetMoneyCents })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuentas"
        subtitle={operatingDayLabel(today, cutoffMins)}
        icon={<Wallet className="h-6 w-6" aria-hidden="true" />}
        actions={
          <AddMovementButton
            label="+ Agregar movimiento"
            date={today}
            cutoffMins={cutoffMins}
            createCashFlowAction={createCashFlowAction}
          />
        }
      />

      <div className="card-entrance">
        <CajaTabs active="/caja/cuentas" />
      </div>

      <div className="card-entrance" style={{ animationDelay: '40ms' }}>
        <CajaHeaderStats
          collectedTodayCents={summary.collected}
          collectedByMethod={summary.collectedByMethod}
          streetMoneyCents={streetMoneyCents}
          streetMoneyCount={streetMoneyRows.length}
          pendingRefundsCents={pendingRefundsCents}
          pendingRefundsCount={refunds.length}
        />
      </div>

      {/* Las dos direcciones de la plata pendiente, lado a lado y con su propio
          total cada una. Deudas manda en ancho: tiene más filas y más acción. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="card-entrance space-y-3" style={{ animationDelay: '80ms' }}>
          <StreetMoneyList rows={streetMoneyRows} />

          {/* El rótulo dice qué se está viendo SIEMPRE, no solo cuando hay algo
              escondido: una pantalla de plata que muestra una ventana sin decirlo
              se lee como "esto es todo lo que me deben". */}
          <p className="text-center text-sm text-muted-foreground">
            {showAll ? (
              <>
                Mostrando <strong className="text-foreground">toda</strong> la deuda registrada.{' '}
                <Link
                  href="/caja/cuentas"
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
                  href="/caja/cuentas?todas=1"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Ver deuda anterior
                </Link>
              </>
            )}
          </p>
        </div>

        <div className="card-entrance" style={{ animationDelay: '120ms' }}>
          <PendingRefundsList rows={refunds} action={markRefundSettledAction} />
        </div>
      </div>

      <div className="card-entrance" style={{ animationDelay: '160ms' }}>
        <MovementsList
          cashFlows={cashFlows}
          date={today}
          cutoffMins={cutoffMins}
          createCashFlowAction={createCashFlowAction}
        />
      </div>
    </div>
  )
}
