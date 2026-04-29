import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getAbonados } from '@/modules/abonados/abonado.service'

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function formatARS(centavos: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
    centavos / 100,
  )
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  paused: 'Pausado',
  canceled: 'Cancelado',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  canceled: 'bg-gray-100 text-gray-500',
}

export default async function AbоnadosPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const abonados = await withTenantContext(tenant.id, (tx) =>
    getAbonados(tenant.id, {}, tx),
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Abonados</h1>
        <a
          href="/abonados/nuevo"
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          + Nuevo Abonado
        </a>
      </div>

      {abonados.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay abonados registrados. Creá el primero con el botón de arriba.
        </p>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3">Día / Horario</th>
                <th className="p-3">Contacto</th>
                <th className="p-3">Precio sesión</th>
                <th className="p-3">Precio mensual</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {abonados.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">
                    {DAY_NAMES[a.dayOfWeek]} {a.timeStart}–{a.timeEnd}
                  </td>
                  <td className="p-3">
                    <div>{a.contactName}</div>
                    <div className="text-muted-foreground text-xs">{a.contactPhone}</div>
                  </td>
                  <td className="p-3">{formatARS(a.pricePerSession)}</td>
                  <td className="p-3">{formatARS(a.monthlyPrice)}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[a.status] ?? ''}`}
                    >
                      {STATUS_LABELS[a.status] ?? a.status}
                    </span>
                  </td>
                  <td className="p-3 space-x-2">
                    {a.status === 'active' && (
                      <>
                        <form action={`/api/abonados/${a.id}`} method="post" className="inline">
                          <button
                            formAction={`/api/abonados/${a.id}`}
                            className="text-xs text-yellow-700 hover:underline"
                            type="button"
                          >
                            Pausar
                          </button>
                        </form>
                        <button className="text-xs text-destructive hover:underline" type="button">
                          Cancelar
                        </button>
                      </>
                    )}
                    {a.status === 'paused' && (
                      <>
                        <button className="text-xs text-green-700 hover:underline" type="button">
                          Reactivar
                        </button>
                        <button className="text-xs text-destructive hover:underline" type="button">
                          Cancelar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
