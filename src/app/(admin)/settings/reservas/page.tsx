import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { ReservasPolicyForm } from './ReservasPolicyForm'

const SETTINGS_TABS = [
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/facturacion', label: 'Facturación' },
]

export default async function ReservasPolicyPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const s = tenant.settings

  return (
    <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>

        <nav className="flex gap-1 border-b border-border">
          {SETTINGS_TABS.map(({ href, label }) => {
            const active = href === '/settings/reservas'
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

        <div className="card-premium rounded-lg p-6">
          <h2 className="mb-6 text-base font-semibold text-foreground">Políticas de Reserva</h2>
          <ReservasPolicyForm s={s} />
        </div>
      </div>
  )
}
