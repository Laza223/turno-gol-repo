import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getDaySummary, getCashFlows } from '@/modules/cashflow/cashflow.service'

function artDateOf(ts: Date): string {
  return new Date(ts.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

function formatARS(centavos: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
    centavos / 100,
  )
}

export default async function CajaPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const today = artDateOf(new Date())

  const { summary, cashFlows } = await withTenantContext(tenant.id, async (tx) => {
    const [s, cf] = await Promise.all([
      getDaySummary(tenant.id, today, tx),
      getCashFlows(tenant.id, today, tx),
    ])
    return { summary: s, cashFlows: cf }
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Caja — {today}</h1>
        {summary.isClosed && (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-500/20">
            Cerrada por {summary.close?.closedBy}
          </span>
        )}
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
                <span className="capitalize">{method}</span>
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
          <p className="p-4 text-sm text-slate-500">
            No hay movimientos registrados para este día.
          </p>
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
                  <td className="p-3 capitalize text-slate-900">{cf.type}</td>
                  <td className="p-3 text-slate-700">{cf.category}</td>
                  <td className="p-3 capitalize text-slate-700">{cf.method}</td>
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

      {!summary.isClosed && (
        <p className="text-sm text-muted-foreground">
          Usá las acciones del panel para agregar movimientos o cerrar la caja.
        </p>
      )}
    </div>
  )
}
