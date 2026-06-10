import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { PinGate } from '@/components/pin-gate'
import { AddClosedDateForm, HorariosForm, RemoveClosedDateForm } from './HorariosForms'

const SETTINGS_TABS = [
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/facturacion', label: 'Facturación' },
  { href: '/settings/pin', label: 'Seguridad' },
]

type OpeningHours = Record<string, { open: string; close: string }>

export default async function HorariosPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const hours = tenant.openingHours as OpeningHours
  const closedDates = (tenant.closedDates ?? []) as unknown as string[]
  const hasPin = !!tenant.settings.staff_pin_hash
  const minDate = new Date().toISOString().split('T')[0] ?? ''

  return (
    <PinGate pinRequired={hasPin}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>

        <nav className="flex gap-1 border-b border-slate-200">
          {SETTINGS_TABS.map(({ href, label }) => {
            const active = href === '/settings/horarios'
            return (
              <a
                key={href}
                href={href}
                className={
                  'px-4 py-2 text-sm font-medium transition-colors duration-150 border-b-2 ' +
                  (active
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-900')
                }
              >
                {label}
              </a>
            )
          })}
        </nav>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-6 text-base font-semibold text-slate-900">Horarios de apertura</h2>
          <HorariosForm hours={hours} />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Días cerrados</h2>

          {closedDates.filter((d) => d >= minDate).length > 0 ? (
            <ul className="mb-4 space-y-2">
              {[...closedDates].filter((d) => d >= minDate).sort().map((date) => (
                <li
                  key={date}
                  className="flex items-center justify-between rounded-md border border-slate-100 px-4 py-2"
                >
                  <span className="text-sm text-slate-700">
                    {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </span>
                  <RemoveClosedDateForm date={date} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-slate-500">No hay días cerrados configurados.</p>
          )}

          <AddClosedDateForm minDate={minDate} />
        </div>
      </div>
    </PinGate>
  )
}
