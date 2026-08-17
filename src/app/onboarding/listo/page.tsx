import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarCheck, CheckCircle2 } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { hasAnyBooking } from '@/modules/onboarding/onboarding.service'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import { markPublicLinkSharedAction } from '@/app/(admin)/dashboard/actions'
import { WizardShell } from '../components/WizardShell'
import { ShareActions } from './ShareActions'
import { ListoReveal, ListoRevealItem } from './ListoReveal'

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
  // Un tenant recién creado no tiene reservas propias: si hay al menos una acá,
  // solo puede ser la que el dueño acaba de cargar en el paso 4 (skippable —
  // por eso se chequea, en vez de asumir que siempre existe).
  const firstBookingCreated = await hasAnyBooking(tenant.id)

  return (
    <WizardShell>
      {/* La card la pone el shell; acá solo el contenido, centrado. */}
      <ListoReveal>
        <div className="text-center">
          <ListoRevealItem big>
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 dark:bg-emerald-500/15">
              <CheckCircle2
                className="h-9 w-9 text-emerald-700 dark:text-emerald-400"
                aria-hidden
              />
            </span>
          </ListoRevealItem>

          <ListoRevealItem>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
              ¡Tu complejo está online!
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tenant.name} ya puede recibir reservas. Falta un solo paso: que tus clientes conozcan
              el link.
            </p>
          </ListoRevealItem>

          {firstBookingCreated && (
            <ListoRevealItem>
              <p className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CalendarCheck className="h-4 w-4 shrink-0" aria-hidden />
                Tu primera reserva ya está en la grilla.
              </p>
            </ListoRevealItem>
          )}

          <ListoRevealItem>
            <ShareActions
              appUrl={appUrl}
              slug={tenant.slug}
              tenantName={tenant.name}
              action={markPublicLinkSharedAction}
            />
          </ListoRevealItem>

          <ListoRevealItem>
            <p className="mt-6 text-xs text-muted-foreground">
              En tu panel te dejamos una checklist con lo que falta para el 100%.
            </p>
            <Link
              href="/dashboard"
              className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              Ir a mi panel
            </Link>
          </ListoRevealItem>
        </div>
      </ListoReveal>
    </WizardShell>
  )
}
