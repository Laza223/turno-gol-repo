import { redirect } from 'next/navigation'
import { CreditCard, CheckCircle2, ExternalLink } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getSubscriptionState } from '@/modules/billing/billing.service'
import { SettingsTabs } from '../SettingsTabs'

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Período de prueba',
  active: 'Activa',
  past_due: 'Pago pendiente',
  suspended: 'Suspendida',
  canceled: 'Cancelada',
  churned: 'Baja',
  blocked: 'Bloqueada',
}

function formatDate(d: string | Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function FacturacionPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  let sub: Awaited<ReturnType<typeof getSubscriptionState>> | null = null
  const mpConnected = !!tenant.mpConnectedAt

  try {
    sub = await withTenantContext(tenant.id, (tx) => getSubscriptionState(tenant.id, tx))
  } catch {
    sub = null
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>

        <SettingsTabs active="/settings/facturacion" />

        <section className="card-premium rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground">Suscripción</h2>
          {sub ? (
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="font-medium text-foreground">{sub.planName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estado</dt>
                <dd className="font-medium text-foreground">{STATUS_LABELS[sub.status] ?? sub.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Próximo cobro</dt>
                <dd className="font-medium text-foreground tabular-nums">{formatDate(sub.currentPeriodEnd)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Todavía no tenés una suscripción activa. Conectá MercadoPago para empezar a cobrar señas y activar tu plan.
            </p>
          )}
        </section>

        <section className="card-premium rounded-xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden /> MercadoPago
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Conectá tu cuenta para cobrar las señas de las reservas online directamente.
              </p>
            </div>
            {mpConnected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/20 dark:ring-emerald-500/30">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Conectado
              </span>
            )}
          </div>
          {!mpConnected && (
            <a
              href="/api/mp/oauth-start"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              Conectar MercadoPago <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          )}
        </section>
    </div>
  )
}
