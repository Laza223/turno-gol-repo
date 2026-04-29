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
          <span className="px-3 py-1 text-sm rounded-full bg-gray-100 text-gray-700">
            Cerrada por {summary.close?.closedBy}
          </span>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Total ingresos</p>
          <p className="text-2xl font-bold text-green-700">{formatARS(summary.totalIncome)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Total ajustes</p>
          <p className="text-2xl font-bold text-blue-700">{formatARS(summary.totalAdjustments)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Balance del día</p>
          <p className="text-2xl font-bold">{formatARS(summary.balance)}</p>
        </div>
      </div>

      {/* By method */}
      {Object.keys(summary.byMethod).length > 0 && (
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-medium mb-3">Desglose por método</h2>
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
      <div className="rounded-lg border">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-medium">Movimientos del día</h2>
        </div>
        {cashFlows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No hay movimientos registrados para este día.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3">Tipo</th>
                <th className="p-3">Categoría</th>
                <th className="p-3">Método</th>
                <th className="p-3">Descripción</th>
                <th className="p-3 text-right">Monto</th>
                <th className="p-3">Hora</th>
              </tr>
            </thead>
            <tbody>
              {cashFlows.map((cf) => (
                <tr key={cf.id} className="border-b last:border-0">
                  <td className="p-3 capitalize">{cf.type}</td>
                  <td className="p-3">{cf.category}</td>
                  <td className="p-3 capitalize">{cf.method}</td>
                  <td className="p-3 max-w-xs truncate">{cf.description}</td>
                  <td className="p-3 text-right font-medium">{formatARS(cf.amount)}</td>
                  <td className="p-3 text-muted-foreground">
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
