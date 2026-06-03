import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { PinGate } from '@/components/pin-gate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateReservasPolicyAction } from './actions'

const SETTINGS_TABS = [
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/facturacion', label: 'Facturación' },
  { href: '/settings/pin', label: 'Seguridad' },
]

export default async function ReservasPolicyPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const s = tenant.settings
  const hasPin = !!s.staff_pin_hash

  return (
    <PinGate pinRequired={hasPin}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>

        <nav className="flex gap-1 border-b border-slate-200">
          {SETTINGS_TABS.map(({ href, label }) => {
            const active = href === '/settings/reservas'
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
          <h2 className="mb-6 text-base font-semibold text-slate-900">Políticas de Reserva</h2>

          <form
            action={updateReservasPolicyAction as unknown as (f: FormData) => Promise<void>}
            className="space-y-6 max-w-lg"
          >
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-slate-700">Seña</legend>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="requiresDeposit"
                    value="true"
                    defaultChecked={s.requires_deposit !== false}
                    className="accent-emerald-600"
                  />
                  Requerir seña
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="requiresDeposit"
                    value="false"
                    defaultChecked={s.requires_deposit === false}
                    className="accent-emerald-600"
                  />
                  Sin seña
                </label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="depositPercentage">Porcentaje de seña (%)</Label>
                <Input
                  id="depositPercentage"
                  name="depositPercentage"
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={100}
                  defaultValue={s.deposit_percentage ?? 30}
                  className="h-10 w-32"
                />
                <p className="text-xs text-slate-500">Entre 10% y 100%</p>
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label>Reservas online</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="allowOnlineBooking"
                    value="true"
                    defaultChecked={s.allow_online_booking !== false}
                    className="accent-emerald-600"
                  />
                  Habilitadas
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="allowOnlineBooking"
                    value="false"
                    defaultChecked={s.allow_online_booking === false}
                    className="accent-emerald-600"
                  />
                  Deshabilitadas
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cancellationHoursBefore">Anticipación mínima para cancelar (horas)</Label>
              <Input
                id="cancellationHoursBefore"
                name="cancellationHoursBefore"
                type="number"
                inputMode="numeric"
                min={0}
                max={72}
                defaultValue={s.cancellation_policy?.hours_before ?? 12}
                className="h-10 w-32"
              />
              <p className="text-xs text-slate-500">0 = sin límite de anticipación</p>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-slate-700">Penalidad por no-show</legend>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="noShowPenaltyType"
                    value="ban_days"
                    defaultChecked={(s.no_show_penalty?.type ?? 'ban_days') === 'ban_days'}
                    className="accent-emerald-600"
                  />
                  Ban temporal
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="noShowPenaltyType"
                    value="none"
                    defaultChecked={s.no_show_penalty?.type === 'none'}
                    className="accent-emerald-600"
                  />
                  Sin penalidad
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="noShowPenaltyThreshold">No-shows para aplicar ban</Label>
                  <Input
                    id="noShowPenaltyThreshold"
                    name="noShowPenaltyThreshold"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10}
                    defaultValue={s.no_show_penalty?.threshold ?? 2}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="noShowPenaltyDays">Días de ban</Label>
                  <Input
                    id="noShowPenaltyDays"
                    name="noShowPenaltyDays"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={30}
                    defaultValue={s.no_show_penalty?.days ?? 7}
                    className="h-10"
                  />
                </div>
              </div>
            </fieldset>

            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500">
              Guardar cambios
            </Button>
          </form>
        </div>
      </div>
    </PinGate>
  )
}
