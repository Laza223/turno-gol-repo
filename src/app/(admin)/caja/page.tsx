import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Banknote,
  Coins,
  CreditCard,
  Receipt,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { StatCard } from '@/components/admin/StatCard'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getDaySummary, getCashFlows, getDayComparisons } from '@/modules/cashflow/cashflow.service'
import { safeDateParam } from '@/shared/validation/calendar-date'
import { EmptyState } from '@/components/ui/empty-state'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { formatArsContable } from '@/lib/format'
import { CajaActions } from './components/CajaActions'
import { CajaCierreHint } from './components/CajaCierreHint'
import { CanteenQuickSale } from './components/CanteenQuickSale'
import { CierreCard } from './components/CierreCard'
import { EmptyMovementAction } from './components/EmptyMovementAction'
import {
  createCashFlowAction,
  closeDayAction,
  saveCanteenProductsAction,
  sellCanteenProductAction,
} from './actions'
import { artDateOf } from '@/shared/time/art-date'
import {
  addDays,
  buildDelta,
  cajaDateLabel,
  categoryLabel,
  formatTimeArt,
  methodBreakdown,
  signedArs,
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

export default async function CajaPage(props: { searchParams: Promise<{ date?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const today = artDateOf(new Date())
  // #16: validar el ?date del deep-link. Un valor basura/imposible (2026-13-45)
  // reventaba el cast SQL ::date y addDays(); degradar a hoy (ART) en su lugar.
  const date = safeDateParam(searchParams.date, today)

  const { summary, cashFlows, comparisons } = await withTenantContext(tenant.id, async (tx) => {
    const [s, cf, comp] = await Promise.all([
      getDaySummary(tenant.id, date, tx),
      getCashFlows(tenant.id, date, tx),
      getDayComparisons(tenant.id, date, tx),
    ])
    return { summary: s, cashFlows: cf, comparisons: comp }
  })

  const ingresos = summary.totalIncome + summary.totalAdjustments
  const methods = methodBreakdown(summary.byMethod)
  const isToday = date === today

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
                className="border-r border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                ← Anterior
              </Link>
              <Link
                href="/caja"
                aria-current={isToday ? 'date' : undefined}
                className={`border-r border-border px-3 py-2 text-sm transition-colors hover:bg-accent ${
                  isToday
                    ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                    : 'text-foreground'
                }`}
              >
                Hoy
              </Link>
              <Link
                href={`/caja?date=${addDays(date, 1)}`}
                className="px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                Siguiente →
              </Link>
            </nav>
            <CajaActions
              date={date}
              totalIncome={ingresos}
              totalExpense={summary.totalExpense}
              balance={summary.balance}
              cashTotal={summary.byMethod.cash ?? 0}
              isClosed={summary.isClosed}
              createCashFlowAction={createCashFlowAction}
              closeDayAction={closeDayAction}
            />
          </>
        }
      />

      {!summary.isClosed && <CajaCierreHint />}

      {/* Peak-end (§5): el cierre abre la vista — recibo verde e inmutable. */}
      {summary.isClosed && summary.close && <CierreCard close={summary.close} />}

      {/* KPIs (§3): orden aritmético Ingresos − Egresos = Saldo en desktop;
          en mobile el saldo (la pregunta №1) va primero y a lo ancho. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="Ingresos"
          value={formatArsContable(ingresos)}
          icon={<ArrowDownToLine className="h-5 w-5" aria-hidden="true" />}
          accent="emerald"
          delta={buildDelta(ingresos, comparisons.yesterday.totalIncome, 'vs ayer') ?? undefined}
          sub={
            ingresos === 0 && comparisons.weekAvg.totalIncome === 0
              ? undefined
              : `vs prom. semanal ${signedArs(ingresos - comparisons.weekAvg.totalIncome)}`
          }
        />
        <StatCard
          label="Egresos"
          value={formatArsContable(summary.totalExpense)}
          icon={<ArrowUpFromLine className="h-5 w-5" aria-hidden="true" />}
          accent="red"
          delta={
            buildDelta(summary.totalExpense, comparisons.yesterday.totalExpense, 'vs ayer', {
              invert: true,
            }) ?? undefined
          }
          sub={
            summary.totalExpense === 0 && comparisons.weekAvg.totalExpense === 0
              ? undefined
              : `vs prom. semanal ${signedArs(summary.totalExpense - comparisons.weekAvg.totalExpense)}`
          }
        />
        <StatCard
          label="Saldo neto del día"
          value={
            summary.balance < 0 ? (
              <span className="text-red-700 dark:text-red-400">
                −{formatArsContable(-summary.balance)}
              </span>
            ) : (
              formatArsContable(summary.balance)
            )
          }
          icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
          accent="emerald"
          delta={buildDelta(summary.balance, comparisons.yesterday.balance, 'vs ayer') ?? undefined}
          sub={
            summary.balance === 0 && comparisons.weekAvg.balance === 0
              ? undefined
              : `vs prom. semanal ${signedArs(summary.balance - comparisons.weekAvg.balance)}`
          }
          className="order-first col-span-2 ring-1 ring-emerald-600/20 dark:ring-emerald-500/25 lg:order-0 lg:col-span-1"
        />
      </div>

      {/* Cantina/Bar: venta rápida con un toque (oculta con caja cerrada) */}
      {!summary.isClosed && (
        <CanteenQuickSale
          date={date}
          products={tenant.settings.canteen_products ?? []}
          sellCanteenProductAction={sellCanteenProductAction}
          saveCanteenProductsAction={saveCanteenProductsAction}
        />
      )}

      {/* Desglose por método (§4): la referencia del arqueo. */}
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
                <EmptyMovementAction date={date} createCashFlowAction={createCashFlowAction} />
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
    </div>
  )
}
