import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { AddClosedDateForm } from './AddClosedDateForm'
import { HorariosForm } from './HorariosForm'
import { RemoveClosedDateForm } from './RemoveClosedDateForm'
import type { LooseOpeningHours } from './horarios-lib'
import { SettingsTabs } from '../SettingsTabs'

export default async function HorariosPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const hours = tenant.openingHours as LooseOpeningHours
  const closedDates = (tenant.closedDates ?? []) as unknown as string[]
  const minDate = new Date().toISOString().split('T')[0] ?? ''

  return (
    <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>

        <SettingsTabs active="/settings/horarios" />

        <div className="card-premium rounded-lg p-6">
          <h2 className="mb-6 text-base font-semibold text-foreground">Horarios de apertura</h2>
          <HorariosForm hours={hours} closesNextDay={tenant.closesNextDay} />
        </div>

        <div className="card-premium rounded-lg p-6">
          <h2 className="mb-4 text-base font-semibold text-foreground">Días cerrados</h2>

          {closedDates.filter((d) => d >= minDate).length > 0 ? (
            <ul className="mb-4 space-y-2">
              {[...closedDates].filter((d) => d >= minDate).sort().map((date) => (
                <li
                  key={date}
                  className="flex items-center justify-between rounded-md border border-border px-4 py-2"
                >
                  <span className="text-sm text-foreground">
                    {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </span>
                  <RemoveClosedDateForm date={date} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">No hay días cerrados configurados.</p>
          )}

          <AddClosedDateForm minDate={minDate} />
        </div>
      </div>
  )
}
