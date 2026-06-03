import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { PinGate } from '@/components/pin-gate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateHorariosAction, addClosedDateAction, removeClosedDateAction } from './actions'

const SETTINGS_TABS = [
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/facturacion', label: 'Facturación' },
  { href: '/settings/pin', label: 'Seguridad' },
]

const DAY_LABELS: Record<string, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves',
  fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
}
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

type OpeningHours = Record<string, { open: string; close: string }>

export default async function HorariosPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const hours = tenant.openingHours as OpeningHours
  const closedDates = (tenant.closedDates ?? []) as unknown as string[]
  const hasPin = !!tenant.settings.staff_pin_hash

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
          <form
            action={updateHorariosAction as unknown as (f: FormData) => Promise<void>}
            className="space-y-3"
          >
            <div className="grid grid-cols-[8rem_1fr_1fr] items-center gap-x-4 gap-y-3">
              <div />
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Apertura</p>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cierre</p>
              {DAYS.map((day) => (
                <div key={day} className="contents">
                  <Label className="text-sm text-slate-700">{DAY_LABELS[day]}</Label>
                  <Input
                    name={`${day}_open`}
                    type="time"
                    defaultValue={hours[day]?.open ?? '08:00'}
                    className="h-10 w-32"
                  />
                  <Input
                    name={`${day}_close`}
                    type="time"
                    defaultValue={hours[day]?.close ?? '00:00'}
                    className="h-10 w-32"
                  />
                </div>
              ))}
            </div>
            <div className="pt-2">
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500">
                Guardar horarios
              </Button>
            </div>
          </form>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Días cerrados</h2>

          {closedDates.length > 0 ? (
            <ul className="mb-4 space-y-2">
              {[...closedDates].sort().map((date) => (
                <li
                  key={date}
                  className="flex items-center justify-between rounded-md border border-slate-100 px-4 py-2"
                >
                  <span className="text-sm text-slate-700">
                    {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </span>
                  <form action={removeClosedDateAction as unknown as (f: FormData) => Promise<void>}>
                    <input type="hidden" name="date" value={date} />
                    <Button variant="ghost" size="sm" type="submit" className="text-red-600 hover:text-red-700">
                      Quitar
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-slate-500">No hay días cerrados configurados.</p>
          )}

          <form action={addClosedDateAction as unknown as (f: FormData) => Promise<void>} className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="closedDate">Agregar día cerrado</Label>
              <Input
                id="closedDate"
                name="date"
                type="date"
                className="h-10 w-48"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <Button type="submit" variant="outline" className="h-10">
              Agregar
            </Button>
          </form>
        </div>
      </div>
    </PinGate>
  )
}
