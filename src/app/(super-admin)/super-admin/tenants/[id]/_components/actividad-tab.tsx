import Link from 'next/link'
import { formatArs } from '@/lib/format'
import type { TenantActivity } from '@/modules/super-admin/tenants.service'
import { Pager } from '@/components/ui/pager'
import { formatDateTimeArt } from '../../_components/format'
import { Card } from './detail-primitives'

/**
 * Tab "Actividad" del detalle de tenant: audit trail paginado (Pager
 * compartido) + últimas 10 reservas. Presentacional puro — la paginación es
 * 100% GET (Link), sin estado de cliente.
 */
export function ActividadTab({
  tenantId,
  activity,
}: {
  tenantId: string
  activity: TenantActivity
}) {
  return (
    <div className="space-y-4">
      <Card title={`Audit trail (${activity.totalLogs})`}>
        {activity.logs.length === 0 ? (
          // `?actPage=99` de un link viejo: hay eventos, lo que no existe es
          // esa página (el título de la tarjeta ya dice cuántos hay).
          <p className="text-sm text-muted-foreground">
            {activity.totalLogs > 0 ? (
              <>
                Esa página no existe.{' '}
                <Link
                  href={`/super-admin/tenants/${tenantId}?tab=actividad&actPage=1`}
                  className="font-medium underline underline-offset-4"
                >
                  Volver al principio
                </Link>
              </>
            ) : (
              'Sin eventos de auditoría.'
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Acción</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">Recurso</th>
                  <th className="py-2">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-foreground">
                {activity.logs.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="whitespace-nowrap py-2 pr-4 tabular-nums text-muted-foreground">
                      {formatDateTimeArt(log.createdAt)}
                    </td>
                    <td className="py-2 pr-4 font-medium">{log.action}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{log.actorType}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{log.resourceType}</td>
                    <td className="max-w-md py-2">
                      {log.metadata ? (
                        <code className="block truncate text-xs text-muted-foreground">
                          {JSON.stringify(log.metadata)}
                        </code>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          label="Paginación del audit trail"
          className="mt-4"
          page={activity.page - 1}
          total={activity.totalLogs}
          pageSize={activity.pageSize}
          shown={activity.logs.length}
          hrefFor={(p) => `/super-admin/tenants/${tenantId}?tab=actividad&actPage=${p + 1}`}
        />
      </Card>

      <Card title="Últimas 10 reservas">
        {activity.recentBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin reservas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Horario</th>
                  <th className="py-2 pr-4">Cancha</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4 text-right">Precio</th>
                  <th className="py-2">Creada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-foreground">
                {activity.recentBookings.map((b) => (
                  <tr key={b.id}>
                    {/* date es columna DATE (sin tz): se muestra tal cual, sin conversión ART. */}
                    <td className="py-2 pr-4 tabular-nums">{b.date.toISOString().slice(0, 10)}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {b.timeStart.slice(0, 5)}–{b.timeEnd.slice(0, 5)}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{b.courtName ?? '—'}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{b.status}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatArs(b.priceSnapshot)}
                    </td>
                    <td className="py-2 tabular-nums text-muted-foreground">
                      {formatDateTimeArt(b.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
