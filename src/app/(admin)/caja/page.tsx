import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Banknote } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { withTenantContext } from '@/shared/db/client'
import { getDaySummary, getCashFlows } from '@/modules/cashflow/cashflow.service'
import { countPendingRefunds } from '@/modules/payments/refund.service'
import { getStreetMoneyTotal } from '@/modules/cashflow/street-money.service'
import { listProducts } from '@/modules/canteen/canteen.service'
import { listOpenTabs } from '@/modules/canteen/canteen-tab.service'
import { track } from '@/shared/observability/breadcrumbs'
import { CajaHeaderStats } from './components/CajaHeaderStats'
import { CajaTabs } from './components/CajaTabs'
import { AddMovementButton } from './cantina/AddMovementButton'
import { MovementsList } from './cantina/MovementsList'
import { MethodBreakdown } from './cantina/MethodBreakdown'
import { TicketPanel } from './cantina/TicketPanel'
import { FiadosList } from './cantina/FiadosList'
import {
  createTabAction,
  sellTicketAction,
  settleTabAction,
  cancelTabAction,
} from './cantina/actions'
import { createCashFlowAction } from './actions'
import { requireCajaContext } from './queries'
import { methodBreakdown } from './caja-lib'

export default async function CajaPage(props: {
  searchParams: Promise<{ configureCanteen?: string }>
}) {
  const searchParams = await props.searchParams

  // Compat con deep links viejos: la configuración de productos vive en su propia tab.
  if (searchParams.configureCanteen === 'true') {
    redirect('/caja/productos?configureCanteen=true')
  }

  const { tenant, cutoffMins, today } = await requireCajaContext()

  // Siempre "hoy" — a diferencia de la vieja Caja del día, /caja no navega
  // por fecha (?date=): mismo criterio que Deudas y Devoluciones.
  const { summary, cashFlows, streetMoney, pendingRefunds, products, tabs } =
    await withTenantContext(tenant.id, async (tx) => {
      const [s, cf, sm, pr, p, t] = await Promise.all([
        getDaySummary(tenant.id, today, cutoffMins, tx),
        getCashFlows(tenant.id, today, cutoffMins, tx),
        getStreetMoneyTotal(tenant.id, tx),
        // Mismo total que /caja/devoluciones: la plata que el complejo DEBE.
        countPendingRefunds(tenant.id, tx),
        listProducts(tenant.id, tx),
        listOpenTabs(tenant.id, tx),
      ])
      return {
        summary: s,
        cashFlows: cf,
        streetMoney: sm,
        pendingRefunds: pr,
        products: p,
        tabs: t,
      }
    })

  // B14: la suma ya viene hecha desde `getDaySummary` (fuente única). Repetirla
  // acá es cómo el mismo "cobrado hoy" termina distinto en dos pantallas.
  const ingresos = summary.collected
  // B10 — solo el número: /caja muestra el total en el encabezado, y traer la
  // lista entera de deuda impaga (3 queries sin LIMIT) para sumarla hacía que
  // el costo de esta pantalla creciera con el negocio. Las filas se ven en
  // /caja/deudas, que sigue usando getStreetMoney.
  const streetMoneyCents = streetMoney.totalCents
  // Proxy "plata en la calle: tendencia ↓ por tenant" (§11).
  track.cashflow('street_money.viewed', { tenantId: tenant.id, totalCents: streetMoneyCents })
  const methods = methodBreakdown(summary.byMethod)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cantina"
        subtitle="Venta rápida con descuento de stock y fiados."
        icon={<Banknote className="h-6 w-6" aria-hidden="true" />}
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
        <CajaTabs active="/caja" />
      </div>

      {/* Encabezado perpetuo: cobrado hoy / deudas / devoluciones, siempre visibles. */}
      <div className="card-entrance" style={{ animationDelay: '40ms' }}>
        <CajaHeaderStats
          collectedTodayCents={ingresos}
          streetMoneyCents={streetMoneyCents}
          pendingRefundsCents={pendingRefunds.totalCents}
        />
      </div>

      <div className="card-entrance" style={{ animationDelay: '80ms' }}>
        <Suspense fallback={null}>
          <TicketPanel
            products={products}
            sellTicketAction={sellTicketAction}
            createTabAction={createTabAction}
          />
        </Suspense>
      </div>

      <div className="card-entrance" style={{ animationDelay: '120ms' }}>
        <FiadosList
          tabs={tabs}
          settleTabAction={settleTabAction}
          cancelTabAction={cancelTabAction}
        />
      </div>

      {/* Movimientos del día */}
      <div className="card-entrance" style={{ animationDelay: '160ms' }}>
        <MovementsList
          cashFlows={cashFlows}
          date={today}
          cutoffMins={cutoffMins}
          createCashFlowAction={createCashFlowAction}
        />
      </div>

      {/* Desglose por método: referencia del arqueo, plegado por defecto (H002). */}
      <div className="card-entrance" style={{ animationDelay: '240ms' }}>
        <MethodBreakdown methods={methods} />
      </div>
    </div>
  )
}
