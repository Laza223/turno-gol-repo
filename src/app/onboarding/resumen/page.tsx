import Link from 'next/link'
import { redirect } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { centsToInputDisplay } from '@/lib/money'
import { cn } from '@/lib/utils'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { listCourts } from '@/modules/courts/court.service'
import {
  isWizardComplete,
  readDraftCounts,
  resolveWizardStep,
  wizardHoursFrom,
} from '@/modules/onboarding/onboarding.service'
import { WIZARD_FORMATS } from '@/modules/onboarding/onboarding.schema'
import { mostFrequentRulePrice } from '@/modules/courts/pricing-grid'
import type { CourtRow } from '@/modules/courts/court.types'
import { stepPath } from '@/modules/onboarding/onboarding.steps'
import { withTenantContext } from '@/shared/db/client'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import { finishOnboardingAction } from '../actions'
import { ACTION_BAR_CLASS } from '../components/action-bar'
import { WizardShell } from '../components/WizardShell'
import { SIGNUP_ACCENT_CLASS, SIGNUP_TITLE_CLASS } from '../components/signup-style'

const hh = (hour: number) => `${String(hour).padStart(2, '0')}:00`

/** Precio de día y, si hay otro, el de noche con su hora de corte: lo que tiene guardada la primera cancha del formato. */
function realPrice(courts: readonly CourtRow[], format: number) {
  const rules = courts.find((c) => c.format === format)?.pricing.rules ?? []
  const day = mostFrequentRulePrice(rules)
  if (day === null) return null
  const night = rules.find((r) => r.price !== day)
  return { day, night: night ? { price: night.price, from: night.from } : null }
}

const INTAKE_LABEL: Record<NonNullable<TenantSettings['booking_intake']>, string> = {
  notebook: 'En un cuaderno o planilla',
  whatsapp: 'Por WhatsApp',
  other_app: 'Con otra app',
  new: 'Recién abro',
}

function Block({
  title,
  children,
  changes,
}: {
  title: string
  children: React.ReactNode
  changes: { href: string; label: string }[]
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/3 p-4">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="mt-1.5 space-y-0.5 text-base text-foreground">{children}</div>
      <div className="mt-2 flex flex-wrap gap-x-2">
        {changes.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-3 h-11 md:h-9')}
          >
            {c.label}
          </Link>
        ))}
      </div>
    </section>
  )
}

/**
 * "¿Está todo bien?": resumen por bloques, cada uno con "Cambiar" hacia su paso.
 * Solo se llega con los 5 pasos hechos; "Terminar" cierra el wizard y lleva a
 * `/onboarding/listo`.
 */
export default async function OnboardingSummaryPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId, user.tenantId)
  if (!tenant) redirect('/onboarding')

  const settings = tenant.settings as TenantSettings
  if (settings.onboarding_completed) redirect('/dashboard')
  if (!isWizardComplete(settings)) redirect(stepPath(resolveWizardStep(settings)))

  // Las canchas REALES y su precio, no el borrador: es lo que va a quedar abierto.
  const courts = (await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))).filter(
    (c) => c.status === 'online',
  )
  const counts = readDraftCounts({ ...settings, onboarding_draft_courts: undefined }, courts)
  const hours = wizardHoursFrom(tenant.openingHours)
  const formats = WIZARD_FORMATS.filter((f) => (counts[String(f)] ?? 0) > 0)

  return (
    <WizardShell>
      <h2 tabIndex={-1} className={SIGNUP_TITLE_CLASS}>
        ¿Está todo <span className={SIGNUP_ACCENT_CLASS}>bien</span>?
      </h2>
      <p className="mt-1.5 text-base text-muted-foreground">
        Revisalo. Todo se puede cambiar después, menos el nombre del link.
      </p>

      <form action={finishOnboardingAction} className="pb-24 md:pb-0">
        <div className="mt-6 space-y-3">
          <Block title="Tu complejo" changes={[{ href: stepPath(1), label: 'Cambiar' }]}>
            <p className="font-medium">{tenant.name}</p>
            <p className="text-muted-foreground">
              {tenant.address}, {tenant.city}, {tenant.province}
            </p>
          </Block>

          <Block title="Canchas" changes={[{ href: stepPath(2), label: 'Cambiar' }]}>
            {formats.map((f) => (
              <p key={f}>
                {counts[String(f)]} {counts[String(f)] === 1 ? 'cancha' : 'canchas'} de Fútbol {f}
              </p>
            ))}
          </Block>

          <Block
            title="Horario y precios"
            changes={[
              { href: stepPath(3), label: 'Cambiar horario' },
              { href: stepPath(4), label: 'Cambiar precios' },
            ]}
          >
            <p>
              Todos los días de {hh(hours.openHour)} a {hh(hours.closeHour)}
            </p>
            {formats.map((f) => {
              const price = realPrice(courts, f)
              if (!price) return null
              return (
                <p key={f} className="text-muted-foreground">
                  Fútbol {f}: ${centsToInputDisplay(price.day)}
                  {price.night &&
                    `, desde las ${price.night.from} $${centsToInputDisplay(price.night.price)}`}
                </p>
              )
            })}
          </Block>

          <Block title="Cómo trabajás" changes={[{ href: stepPath(5), label: 'Cambiar' }]}>
            {settings.booking_intake && <p>{INTAKE_LABEL[settings.booking_intake]}</p>}
            <p className="text-muted-foreground">
              {settings.has_fixed_teams ? 'Con equipos fijos' : 'Sin equipos fijos'}
              {', '}
              {settings.canteen_enabled === false ? 'sin buffet o kiosco' : 'con buffet o kiosco'}
            </p>
          </Block>
        </div>

        <div className={ACTION_BAR_CLASS}>
          <SubmitButton className="flex-1" pendingLabel="Abriendo tu complejo…">
            Abrir mi complejo
          </SubmitButton>
        </div>
      </form>
    </WizardShell>
  )
}
