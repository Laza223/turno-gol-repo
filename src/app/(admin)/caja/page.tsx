import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Banknote } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { withTenantContext } from '@/shared/db/client'
import { getDaySummary, getCashFlows } from '@/modules/cashflow/cashflow.service'
import { getDayOpen } from '@/modules/cashflow/cash-open.service'
import { getStreetMoneyTotal } from '@/modules/cashflow/street-money.service'
import { track } from '@/shared/observability/breadcrumbs'
import { safeDateParam } from '@/shared/validation/calendar-date'
import { CajaActions } from './components/CajaActions'
import { CajaCierreHint } from './components/CajaCierreHint'
import { CajaHeaderStats } from './components/CajaHeaderStats'
import { CajaTabs } from './components/CajaTabs'
import { CierreCard } from './components/CierreCard'
import { OpenDayCard } from './components/OpenDayCard'
import { MovementsList } from './components/MovementsList'
import { MethodBreakdown } from './components/MethodBreakdown'
import { createCashFlowAction, closeDayAction, openDayAction } from './actions'
import { requireCajaContext } from './queries'
import { addDays, cajaDateLabel, methodBreakdown } from './caja-lib'

export default async function CajaPage(props: {
  searchParams: Promise<{ date?: string; configureCanteen?: string }>
}) {
  const searchParams = await props.searchParams

  // Compat con deep links viejos: la configuración de productos vive ahora en su propia tab.
  if (searchParams.configureCanteen === 'true') {
    redirect('/caja/productos?configureCanteen=true')
  }

  const { tenant, cutoffMins, today } = await requireCajaContext()

  // #16: validar el ?date del deep-link. Un valor basura/imposible (2026-13-45)
  // reventaba el cast SQL ::date y addDays(); degradar a hoy (día operativo) en su lugar.
  const date = safeDateParam(searchParams.date, today)

  const { summary, cashFlows, open, streetMoney } = await withTenantContext(
    tenant.id,
    async (tx) => {
      const [s, cf, o, sm] = await Promise.all([
        getDaySummary(tenant.id, date, cutoffMins, tx),
        getCashFlows(tenant.id, date, cutoffMins, tx),
        getDayOpen(tenant.id, date, tx),
        getStreetMoneyTotal(tenant.id, tx),
      ])
      return { summary: s, cashFlows: cf, open: o, streetMoney: sm }
    },
  )

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
  const isToday = date === today
  // Fondo inicial (si se abrió la caja) + neto efectivo del día: la referencia
  // real para el arqueo (migr. 049) — reemplaza el saldo neto de toda la caja
  // (que mezcla métodos de pago) como comparación del cierre.
  const expectedCash = (open?.openingCash ?? 0) + (summary.byMethod.cash ?? 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja"
        subtitle={cajaDateLabel(date, today)}
        icon={<Banknote className="h-6 w-6" aria-hidden="true" />}
        actions={
          <>
            <nav
              aria-label="Cambiar de día"
              className="flex items-center overflow-hidden rounded-lg border border-border bg-card"
            >
              <Link
                href={`/caja?date=${addDays(date, -1)}`}
                className="inline-flex min-h-11 items-center border-r border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent md:min-h-9"
              >
                ← Anterior
              </Link>
              <Link
                href="/caja"
                aria-current={isToday ? 'date' : undefined}
                className={`inline-flex min-h-11 items-center border-r border-border px-3 py-2 text-sm transition-colors hover:bg-accent md:min-h-9 ${
                  isToday
                    ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                    : 'text-foreground'
                }`}
              >
                Hoy
              </Link>
              <Link
                href={`/caja?date=${addDays(date, 1)}`}
                className="inline-flex min-h-11 items-center px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent md:min-h-9"
              >
                Siguiente →
              </Link>
            </nav>
            <CajaActions
              date={date}
              tenantId={tenant.id}
              cutoffMins={cutoffMins}
              totalIncome={ingresos}
              totalExpense={summary.totalExpense}
              balance={summary.balance}
              cashTotal={summary.byMethod.cash ?? 0}
              expectedCash={expectedCash}
              openingCash={open?.openingCash ?? null}
              isClosed={summary.isClosed}
              createCashFlowAction={createCashFlowAction}
              closeDayAction={closeDayAction}
            />
          </>
        }
      />

      <div className="card-entrance">
        <CajaTabs active="/caja" />
      </div>

      {/* Encabezado perpetuo (Fase 1, criterio #1): siempre visible, día abierto o cerrado. */}
      <div className="card-entrance" style={{ animationDelay: '40ms' }}>
        <CajaHeaderStats
          collectedTodayCents={ingresos}
          streetMoneyCents={streetMoneyCents}
          isClosed={summary.isClosed}
          openedAt={open?.openedAt ?? null}
          closedAt={summary.close?.closedAt ?? null}
        />
      </div>

      {!summary.isClosed && (
        <div className="card-entrance" style={{ animationDelay: '80ms' }}>
          <OpenDayCard date={date} open={open} openDayAction={openDayAction} isToday={isToday} />
        </div>
      )}

      {!summary.isClosed && (
        <div className="card-entrance" style={{ animationDelay: '120ms' }}>
          <CajaCierreHint />
        </div>
      )}

      {/* Peak-end (§5): el cierre abre la vista — recibo verde e inmutable. */}
      {summary.isClosed && summary.close && (
        <div className="card-entrance" style={{ animationDelay: '80ms' }}>
          <CierreCard close={summary.close} />
        </div>
      )}

      {/* Movimientos del día */}
      <div className="card-entrance" style={{ animationDelay: '160ms' }}>
        <MovementsList
          cashFlows={cashFlows}
          isClosed={summary.isClosed}
          date={date}
          cutoffMins={cutoffMins}
          createCashFlowAction={createCashFlowAction}
        />
      </div>

      {/* Desglose por método: referencia del arqueo, al final para no abrumar. */}
      <div className="card-entrance" style={{ animationDelay: '240ms' }}>
        <MethodBreakdown methods={methods} />
      </div>
    </div>
  )
}
