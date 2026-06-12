import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getDaySummary, getCashFlows, getDayComparisons } from '@/modules/cashflow/cashflow.service'
import { safeDateParam } from '@/shared/validation/calendar-date'
import { EmptyState } from '@/components/ui/empty-state'
import { CajaActions } from './components/CajaActions'
import { CanteenQuickSale } from './components/CanteenQuickSale'
import { artDateOf } from '@/shared/time/art-date'

function formatARS(centavos: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
    centavos / 100,
  )
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// "vs ayer +$1.500" / "vs prom. semanal −$800". Para egresos (invert) subir es malo.
function DeltaLine({
  label,
  current,
  reference,
  invert = false,
}: {
  label: string
  current: number
  reference: number
  invert?: boolean
}) {
  const delta = current - reference
  const color =
    delta === 0 ? 'text-slate-400' : (delta > 0) !== invert ? 'text-emerald-600' : 'text-red-600'
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  return (
    <p className="text-xs text-slate-500">
      {label}{' '}
      <span className={`font-medium tabular-nums ${color}`}>
        {sign}
        {formatARS(Math.abs(delta))}
      </span>
    </p>
  )
}

// Labels en español para los ENUMs de cash_flows (evita mostrar los valores
// crudos "income"/"booking"/"cash" en la UI). Mismo criterio que RegisterMovementModal.
const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mercadopago: 'MercadoPago',
  other: 'Otro',
}

// 'other' es ambiguo sin el tipo: como ingreso es "Otro ingreso", como ajuste es "Ajuste".
function categoryLabel(type: string, category: string): string {
  if (category === 'booking') return 'Reserva'
  if (category === 'product_sale') return 'Cantina/Bar'
  if (category === 'operating_expense') return 'Gasto operativo'
  if (category === 'no_show_correction') return 'Corrección por ausencia'
  if (category === 'other') return type === 'adjustment' ? 'Ajuste' : 'Otro ingreso'
  return category
}

const CATEGORY_BADGE: Record<string, string> = {
  booking: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  product_sale: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  operating_expense: 'bg-red-50 text-red-700 ring-red-600/20',
  no_show_correction: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  other: 'bg-slate-100 text-slate-700 ring-slate-500/20',
}

function CategoryBadge({ type, category }: { type: string; category: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CATEGORY_BADGE[category] ?? CATEGORY_BADGE.other}`}
    >
      {categoryLabel(type, category)}
    </span>
  )
}

export default async function CajaPage({ searchParams }: { searchParams: { date?: string } }) {
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

  const prevDay = addDays(date, -1)
  const nextDay = addDays(date, 1)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Caja — {date}</h1>
          {summary.isClosed && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-500/20">
              Caja cerrada
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-slate-200 bg-white overflow-hidden">
            <Link
              href={`/caja?date=${prevDay}`}
              className="px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-r border-slate-200"
            >
              ← Anterior
            </Link>
            <Link
              href="/caja"
              className="px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-r border-slate-200"
            >
              Hoy
            </Link>
            <Link
              href={`/caja?date=${nextDay}`}
              className="px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Siguiente →
            </Link>
          </div>
          <CajaActions
            date={date}
            totalIncome={summary.totalIncome + summary.totalAdjustments}
            totalExpense={summary.totalExpense}
            balance={summary.balance}
            isClosed={summary.isClosed}
          />
        </div>
      </div>

      {/* Resumen del día: saldo neto destacado (primero en mobile), ingresos y egresos
          con comparativa vs ayer y vs promedio diario de la última semana. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="col-span-2 order-first lg:order-last lg:col-span-1 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
          <p className="text-sm text-slate-600">Saldo neto del día</p>
          <p className={`text-3xl font-bold tabular-nums ${summary.balance < 0 ? 'text-red-700' : 'text-emerald-800'}`}>
            {formatARS(summary.balance)}
          </p>
          <div className="mt-2 space-y-0.5">
            <DeltaLine label="vs ayer" current={summary.balance} reference={comparisons.yesterday.balance} />
            <DeltaLine label="vs prom. semanal" current={summary.balance} reference={comparisons.weekAvg.balance} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Ingresos</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-700">
            {formatARS(summary.totalIncome + summary.totalAdjustments)}
          </p>
          <div className="mt-2 space-y-0.5">
            <DeltaLine
              label="vs ayer"
              current={summary.totalIncome + summary.totalAdjustments}
              reference={comparisons.yesterday.totalIncome}
            />
            <DeltaLine
              label="vs prom. semanal"
              current={summary.totalIncome + summary.totalAdjustments}
              reference={comparisons.weekAvg.totalIncome}
            />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Egresos</p>
          <p className="text-2xl font-bold tabular-nums text-red-700">{formatARS(summary.totalExpense)}</p>
          <div className="mt-2 space-y-0.5">
            <DeltaLine
              label="vs ayer"
              current={summary.totalExpense}
              reference={comparisons.yesterday.totalExpense}
              invert
            />
            <DeltaLine
              label="vs prom. semanal"
              current={summary.totalExpense}
              reference={comparisons.weekAvg.totalExpense}
              invert
            />
          </div>
        </div>
      </div>

      {/* Cierre guardado: el registro inmutable que generó "Cerrar caja" */}
      {summary.isClosed && summary.close && (
        <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 shadow-sm">
          <h2 className="text-sm font-medium text-slate-900">
            Cierre del día —{' '}
            {summary.close.closedAt.toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Argentina/Buenos_Aires',
            })}{' '}
            hs
          </h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-slate-500">Ingresos</dt>
              <dd className="font-medium tabular-nums text-emerald-700">
                {formatARS(summary.close.totalIncome + summary.close.totalAdjustments)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Egresos</dt>
              <dd className="font-medium tabular-nums text-red-700">−{formatARS(summary.close.totalExpense)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Saldo neto</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{formatARS(summary.close.balance)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Efectivo contado</dt>
              <dd className="font-medium tabular-nums text-slate-900">
                {formatARS(summary.close.declaredCash)}
                {summary.close.diffAmount !== 0 && (
                  <span className="ml-1 text-xs font-medium text-amber-700">
                    (dif. {formatARS(summary.close.diffAmount)})
                  </span>
                )}
              </dd>
            </div>
          </dl>
          {summary.close.note && (
            <p className="mt-2 text-sm text-slate-600">
              <span className="text-slate-500">Nota:</span> {summary.close.note}
            </p>
          )}
        </div>
      )}

      {/* Cantina/Bar: venta rápida de productos pre-cargados (oculta con caja cerrada) */}
      {!summary.isClosed && (
        <CanteenQuickSale date={date} products={tenant.settings.canteen_products ?? []} />
      )}

      {/* By method */}
      {Object.keys(summary.byMethod).length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Desglose por método</h2>
          <div className="space-y-1">
            {Object.entries(summary.byMethod).map(([method, total]) => (
              <div key={method} className="flex justify-between text-sm">
                <span>{METHOD_LABELS[method] ?? method}</span>
                <span>{formatARS(total ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movements list */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Movimientos del día</h2>
        </div>
        {cashFlows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Sin movimientos"
            description="No hay movimientos registrados para este día."
          />
        ) : (
          <>
            {/* Mobile: cards apiladas (el admin mira la caja desde el celular en la barra) */}
            <ul className="divide-y divide-slate-100 sm:hidden">
              {cashFlows.map((cf) => (
                <li key={cf.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <CategoryBadge type={cf.type} category={cf.category} />
                    <p className="mt-1 truncate text-sm text-slate-700">{cf.description}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {METHOD_LABELS[cf.method] ?? cf.method} ·{' '}
                      {cf.occurredAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-semibold tabular-nums ${cf.type === 'expense' ? 'text-red-700' : 'text-slate-900'}`}
                  >
                    {cf.type === 'expense' ? '−' : ''}
                    {formatARS(cf.amount)}
                  </p>
                </li>
              ))}
            </ul>
            {/* Desktop: tabla */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="p-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Categoría</th>
                    <th className="p-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Método</th>
                    <th className="p-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Descripción</th>
                    <th className="p-3 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">Monto</th>
                    <th className="p-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cashFlows.map((cf) => (
                    <tr key={cf.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <CategoryBadge type={cf.type} category={cf.category} />
                      </td>
                      <td className="p-3 text-slate-700">{METHOD_LABELS[cf.method] ?? cf.method}</td>
                      <td className="p-3 max-w-xs truncate text-slate-700">{cf.description}</td>
                      <td
                        className={`p-3 text-right font-medium tabular-nums ${cf.type === 'expense' ? 'text-red-700' : 'text-slate-900'}`}
                      >
                        {cf.type === 'expense' ? '−' : ''}
                        {formatARS(cf.amount)}
                      </td>
                      <td className="p-3 tabular-nums text-slate-500">
                        {cf.occurredAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
