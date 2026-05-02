import { redirect } from 'next/navigation'
import { Shield } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { PinGate } from '@/components/pin-gate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setPinAction } from './actions'

const SETTINGS_TABS = [
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/pin', label: 'Seguridad' },
]

export default async function PinSettingsPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const hasPin = !!tenant.settings.staff_pin_hash

  return (
    <PinGate>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>

        <nav className="flex gap-1 border-b border-slate-200">
          {SETTINGS_TABS.map(({ href, label }) => {
            const active = href === '/settings/pin'
            return (
              <a
                key={href}
                href={href}
                className="px-4 py-2 text-sm font-medium transition-colors duration-150"
                style={{
                  borderBottom: active ? '2px solid #0369A1' : '2px solid transparent',
                  color: active ? '#0369A1' : '#64748b',
                }}
              >
                {label}
              </a>
            )
          })}
        </nav>

        <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50">
              <Shield className="h-5 w-5 text-sky-600" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {hasPin ? 'Cambiar PIN de administrador' : 'Configurar PIN de administrador'}
              </h2>
              <p className="text-xs text-slate-500">
                {hasPin
                  ? 'El PIN protege precios, configuración y gestión de equipo.'
                  : 'Sin PIN configurado, las zonas sensibles no están protegidas.'}
              </p>
            </div>
          </div>

          <form
            action={setPinAction as unknown as (f: FormData) => Promise<void>}
            className="space-y-4"
          >
            {hasPin && (
              <div className="space-y-1.5">
                <Label htmlFor="currentPin">PIN actual</Label>
                <Input
                  id="currentPin"
                  name="currentPin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4,8}"
                  autoComplete="current-password"
                  className="h-10"
                  placeholder="••••"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="newPin">Nuevo PIN</Label>
              <Input
                id="newPin"
                name="newPin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                autoComplete="new-password"
                className="h-10"
                placeholder="••••"
              />
              <p className="text-xs text-slate-500">4 a 8 dígitos numéricos.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPin">Confirmar nuevo PIN</Label>
              <Input
                id="confirmPin"
                name="confirmPin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                autoComplete="new-password"
                className="h-10"
                placeholder="••••"
              />
            </div>
            <Button type="submit" className="w-full bg-sky-700 hover:bg-sky-800">
              {hasPin ? 'Cambiar PIN' : 'Configurar PIN'}
            </Button>
          </form>

          {!hasPin && (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <strong>Recomendado:</strong> Configurá un PIN antes de dar acceso a empleados.
            </p>
          )}
        </div>
      </div>
    </PinGate>
  )
}
