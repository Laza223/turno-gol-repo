import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import { WizardShell } from '../components/WizardShell'
import { ShareActions } from './ShareActions'

/**
 * Cierre peak-end del wizard (pages/onboarding.md §6.4): el complejo quedó
 * online y la acción que dispara el Aha Moment (compartir el link) está acá,
 * no enterrada en un dashboard mudo. La checklist del dashboard toma la posta.
 */
export default async function OnboardingListoPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/onboarding')
  const settings = tenant.settings as TenantSettings
  if (!settings.onboarding_completed) redirect('/onboarding')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? null

  return (
    <WizardShell currentStep={5}>
      <div className="card-premium rounded-2xl p-6 text-center md:p-8">
        <div className="animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 dark:bg-emerald-500/15">
            <CheckCircle2 className="h-9 w-9 text-emerald-700 dark:text-emerald-400" aria-hidden />
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
            ¡Tu complejo está online!
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tenant.name} ya puede recibir reservas. Falta un solo paso: que tus
            clientes conozcan el link.
          </p>
        </div>

        <ShareActions appUrl={appUrl} slug={tenant.slug} tenantName={tenant.name} />

        <p className="mt-6 text-xs text-muted-foreground">
          En tu panel te dejamos una checklist con lo que falta para el 100%.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          Ir a mi panel
        </Link>
      </div>
    </WizardShell>
  )
}
