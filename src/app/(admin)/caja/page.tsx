import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowRightLeft,
  Banknote,
  Coins,
  CreditCard,
  Receipt,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getDaySummary, getCashFlows } from '@/modules/cashflow/cashflow.service'
import { getDayOpen } from '@/modules/cashflow/cash-open.service'
import { safeDateParam } from '@/shared/validation/calendar-date'
import { EmptyState } from '@/components/ui/empty-state'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { formatArsContable } from '@/lib/format'
import { CajaActions } from './components/CajaActions'
import { CajaCierreHint } from './components/CajaCierreHint'
import { CajaTabs } from './components/CajaTabs'
import { CierreCard } from './components/CierreCard'
import { EmptyMovementAction } from './components/EmptyMovementAction'
import { OpenDayCard } from './components/OpenDayCard'
import { createCashFlowAction, closeDayAction, openDayAction } from './actions'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'
import {
  addDays,
  cajaDateLabel,
  categoryLabel,
  formatTimeArt,
  methodBreakdown,
  CATEGORY_BADGE,
  METHOD_LABELS,
  type MethodKey,
} from './caja-lib'

// Monto con signo y color SIEMPRE (§2.5): egresos −rojo; ingresos/ajustes
// +emerald. En una tabla mayormente verde, el gasto es el distinto que salta.
function SignedAmount({ type, amount }: { type: string; amount: number }) {
  const isExpense = type === 'expense'
  return (
    <span
      className={`font-medium tabular-nums ${
        isExpense
          ? 'text-red-700 dark:text-red-400'
          : 'text-emerald-700 dark:text-emerald-400'
      }`}
    >
      {isExpense ? '−' : '+'}
      {formatArsContable(amount)}
    </span>
  )
}

function CategoryBadge({ type, category }: { type: string; category: string }) {
  const badge = CATEGORY_BADGE[category as keyof typeof CATEGORY_BADGE] ?? CATEGORY_BADGE.fallback
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge}`}
    >
      {categoryLabel(type, category)}
    </span>
  )
}

const METHOD_ICON: Record<MethodKey, LucideIcon> = {
  cash: Banknote,
  transfer: ArrowRightLeft,
  mercadopago: CreditCard,
  other: Coins,
}

export default async function CajaPage(props: {
  searchParams: Promise<{ date?: string; configureCanteen?: string }>
}) {
  const searchParams = await props.searchParams;
  // Compat con deep links viejos: la configuración de productos vive ahora
  // en su propia tab.
  if (searchParams.configureCanteen === 'true') {
    redirect('/caja/productos?configureCanteen=true')
  }

  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const cutoffMins = nightCutoffMins(tenant.openingHours, tenant.closesNextDay)
  const today = operatingDateOf(new Date(), cutoffMins)
  // #16: validar el ?date del deep-link. Un valor basura/imposible (2026-13-45)
  // reventaba el cast SQL ::date y addDays(); degradar a hoy (día operativo) en su lugar.
  const date = safeDateParam(searchParams.date, today)

  const { summary, cashFlows, open } = await withTenantContext(tenant.id, async (tx) => {
    const [s, cf, o] = await Promise.all([
      getDaySummary(tenant.id, date, cutoffMins, tx),
      getCashFlows(tenant.id, date, cutoffMins, tx),
      getDayOpen(tenant.id, date, tx),
    ])
    return { summary: s, cashFlows: cf, open: o }
  })

  const ingresos = summary.totalIncome + summary.totalAdjustments
  const methods = methodBreakdown(summary.byMethod)
  const isToday = date === today
  // Fondo inicial (si se abrió la caja) + neto efectivo del día: la referencia
  // real para el arqueo (migr. 049) — reemplaza el saldo neto de toda la caja
  // (que mezcla métodos de pago) como comparación del cierre.
  const expectedCash = (open?.openingCash ?? 0) + (summary.byMethod.cash ?? 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja y Cantina"
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

      <CajaTabs active="/caja" />

      {!summary.isClosed && (
        <OpenDayCard
          date={date}
          open={open}
          openDayAction={openDayAction}
          isToday={isToday}
        />
      )}

      {!summary.isClosed && <CajaCierreHint />}

      {/* Peak-end (§5): el cierre abre la vista — recibo verde e inmutable. */}
      {summary.isClosed && summary.close && <CierreCard close={summary.close} />}

      {/* Movimientos del día */}
      {cashFlows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card shadow-xs">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-medium text-foreground">Movimientos del día</h2>
          </div>
          {summary.isClosed ? (
            // Día cerrado: no hay nada para registrar, así que sin action.
            <EmptyState icon={Receipt} title="Este día no tuvo movimientos." />
          ) : (
            <EmptyState
              icon={Receipt}
              title="Sin movimientos por ahora"
              description="Los cobros de reservas se registran solos. Las ventas de cantina y los gastos se cargan desde los botones de arriba."
              action={
                <EmptyMovementAction
                  date={date}
                  cutoffMins={cutoffMins}
                  createCashFlowAction={createCashFlowAction}
                />
              }
            />
          )}
        </div>
      ) : (
        <ResponsiveList
          className="shadow-xs"
          header={
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-medium text-foreground">Movimientos del día</h2>
            </div>
          }
          cards={
            // Mobile: cards apiladas (el admin mira la caja desde el celular en la barra)
            <ul className="divide-y divide-border">
              {cashFlows.map((cf) => (
                <li key={cf.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <CategoryBadge type={cf.type} category={cf.category} />
                    <p className="mt-1 truncate text-sm text-foreground">{cf.description}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {formatTimeArt(cf.occurredAt)} · {METHOD_LABELS[cf.method] ?? cf.method}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm">
                    <SignedAmount type={cf.type} amount={cf.amount} />
                  </p>
                </li>
              ))}
            </ul>
          }
          table={
            // Desktop: tabla densa §6.6 — diario cronológico, monto a la derecha
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-2.5 pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Hora
                  </th>
                  <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Descripción
                  </th>
                  <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Categoría
                  </th>
                  <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Método
                  </th>
                  <th className="p-2.5 pr-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Monto
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cashFlows.map((cf) => (
                  <tr key={cf.id} className="transition-colors hover:bg-accent/50">
                    <td className="p-2.5 pl-4 tabular-nums text-muted-foreground">
                      {formatTimeArt(cf.occurredAt)}
                    </td>
                    <td className="max-w-xs truncate p-2.5 text-foreground">{cf.description}</td>
                    <td className="p-2.5">
                      <CategoryBadge type={cf.type} category={cf.category} />
                    </td>
                    <td className="p-2.5 text-foreground">
                      {METHOD_LABELS[cf.method] ?? cf.method}
                    </td>
                    <td className="p-2.5 pr-4 text-right">
                      <SignedAmount type={cf.type} amount={cf.amount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
      )}

      {/* Desglose por método: referencia del arqueo, al final para no abrumar. */}
      {methods.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Desglose por método</h2>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Neto del día: ingresos menos gastos por método.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {methods.map(({ key, label, total }) => {
              const Icon = METHOD_ICON[key]
              return (
                <div key={key} className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="truncate text-sm font-semibold tabular-nums text-foreground">
                      {total < 0 ? `−${formatArsContable(-total)}` : formatArsContable(total)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
