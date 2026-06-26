import { redirect } from 'next/navigation'
import { Shield } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { PinGate } from '@/components/pin-gate'
import { PinForm } from './PinForm'

const SETTINGS_TABS = [
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/facturacion', label: 'Facturación' },
  { href: '/settings/pin', label: 'Seguridad' },
]

export default async function PinSettingsPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const hasPin = !!tenant.settings.staff_pin_hash

  return (
    <PinGate pinRequired={hasPin}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>

        <nav className="flex gap-1 border-b border-border">
          {SETTINGS_TABS.map(({ href, label }) => {
            const active = href === '/settings/pin'
            return (
              <a
                key={href}
                href={href}
                className={
                  'px-4 py-2 text-sm font-medium transition-colors duration-150 border-b-2 ' +
                  (active
                    ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground')
                }
              >
                {label}
              </a>
            )
          })}
        </nav>

        <div className="max-w-md card-premium rounded-lg p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
              <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {hasPin ? 'Cambiar PIN de administrador' : 'Configurar PIN de administrador'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {hasPin
                  ? 'El PIN protege precios, configuración y gestión de equipo.'
                  : 'Sin PIN configurado, las zonas sensibles no están protegidas.'}
              </p>
            </div>
          </div>

          <PinForm hasPin={hasPin} />

          {!hasPin && (
            <p className="mt-4 rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
              <strong>Recomendado:</strong> Configurá un PIN antes de dar acceso a empleados.
            </p>
          )}
        </div>
      </div>
    </PinGate>
  )
}
