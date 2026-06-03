import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getDaySummary, getCashFlows } from '@/modules/cashflow/cashflow.service'
import { EmptyState } from '@/components/ui/empty-state'
import { CajaActions } from './components/CajaActions'

function artDateOf(ts: Date): string {
  return new Date(ts.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

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

// Labels en español para los ENUMs de cash_flows (evita mostrar los valores
// crudos "income"/"booking"/"cash" en la UI). Mismo criterio que RegisterMovementModal.
const TYPE_LABELS: Record<string, string> = {
  income: 'Ingreso',
  adjustment: 'Ajuste',
}
const CATEGORY_LABELS: Record<string, string> = {
  booking: 'Reserva',
  product_sale: 'Venta de producto',
  other: 'Otro',
  no_show_correction: 'Corrección no-show',
}
const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mercadopago: 'MercadoPago',
  other: 'Otro',
}

export default async function CajaPage({ searchParams }: { searchParams: { date?: string } }) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const today = artDateOf(new Date())
  const date = searchParams.date ?? today

  const { summary, cashFlows } = await withTenantContext(tenant.id, async (tx) => {
    const [s, cf] = await Promise.all([
      getDaySummary(tenant.id, date, tx),
      getCashFlows(tenant.id, date, tx),
    ])
    return { summary: s, cashFlows: cf }
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
              Cerrada por {summary.close?.closedBy}
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
          <CajaActions date={date} balance={summary.balance} isClosed={summary.isClosed} />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total ingresos</p>
          <p className="text-2xl font-bold tabular-nums text-green-700">{formatARS(summary.totalIncome)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total ajustes</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-700">{formatARS(summary.totalAdjustments)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Balance del día</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{formatARS(summary.balance)}</p>
        </div>
      </div>

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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="p-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Tipo</th>
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
                  <td className="p-3 text-slate-900">{TYPE_LABELS[cf.type] ?? cf.type}</td>
                  <td className="p-3 text-slate-700">{CATEGORY_LABELS[cf.category] ?? cf.category}</td>
                  <td className="p-3 text-slate-700">{METHOD_LABELS[cf.method] ?? cf.method}</td>
                  <td className="p-3 max-w-xs truncate text-slate-700">{cf.description}</td>
                  <td className="p-3 text-right font-medium tabular-nums text-slate-900">{formatARS(cf.amount)}</td>
                  <td className="p-3 tabular-nums text-slate-500">
                    {cf.occurredAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
