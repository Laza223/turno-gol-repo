import { redirect } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CheckCircle2 } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import { markPublicLinkSharedAction } from '@/app/(admin)/dashboard/actions'
import { WizardShell } from '../components/WizardShell'
import { SIGNUP_ACCENT_CLASS, SIGNUP_TITLE_CLASS } from '../components/signup-style'
import { ShareActions } from './ShareActions'
import { ListoReveal, ListoRevealItem } from './ListoReveal'

/**
 * Cierre peak-end del wizard (pages/onboarding.md §6.4): el complejo quedó
 * online y la acción que dispara el Aha Moment (compartir el link) está acá,
 * no enterrada en un dashboard mudo. La primera reserva y la seña pasaron a la
 * checklist del panel, que toma la posta.
 */
export default async function OnboardingListoPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId, user.tenantId)
  if (!tenant) redirect('/onboarding')
  const settings = tenant.settings as TenantSettings
  if (!settings.onboarding_completed) redirect('/onboarding')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? null

  return (
    <WizardShell>
      {/* La card la pone el shell; acá solo el contenido, centrado. */}
      <ListoReveal>
        <div className="text-center">
          <ListoRevealItem big>
            <span className="reserva-success-badge mx-auto flex h-20 w-20 items-center justify-center rounded-full">
              <CheckCircle2 className="h-10 w-10 text-emerald-300" aria-hidden />
            </span>
          </ListoRevealItem>

          <ListoRevealItem>
            <h2 tabIndex={-1} className={`mt-5 ${SIGNUP_TITLE_CLASS}`}>
              ¡Tu complejo está <span className={SIGNUP_ACCENT_CLASS}>online</span>!
            </h2>
            <p className="mt-2 text-base text-muted-foreground">
              {tenant.name} ya puede recibir reservas. Mandale el link a tus jugadores.
            </p>
          </ListoRevealItem>

          <ListoRevealItem>
            <ShareActions
              appUrl={appUrl}
              slug={tenant.slug}
              tenantName={tenant.name}
              action={markPublicLinkSharedAction}
            />
          </ListoRevealItem>

          <ListoRevealItem>
            <p className="mt-6 text-sm text-muted-foreground">
              Los nombres de las canchas, tu logo y los precios por día los cambiás cuando quieras.
            </p>
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                'mt-2 h-12 w-full text-base md:h-12',
              )}
            >
              Ir a mi panel
            </Link>
          </ListoRevealItem>
        </div>
      </ListoReveal>
    </WizardShell>
  )
}
