import {
  Banknote,
  BellRing,
  Clock,
  CreditCard,
  Eye,
  Globe,
  HandCoins,
  LogOut,
  Mail,
  Receipt,
  Store,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { requireAdminStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { getSubscriptionState, listActivePlans } from '@/modules/billing/billing.service'
import { buildPriceBreakdown } from '@/modules/billing/pricing'
import { listStaffRoster } from '@/modules/staff/staff.service'
import { getProfileGaps } from '@/modules/tenants/setup-gaps'
import { deriveScheduleView, type LooseOpeningHours } from '@/lib/schedule/schedule-view'
import { formatArs } from '@/lib/format'
import type { StatusTone } from '@/lib/status-tone'
import { firstCuotaPricing } from './facturacion/cuota-pricing'
import { SUBSCRIPTION_STATUS_LABEL } from './facturacion/subscription-status-label'
import { SettingsHeader } from './SettingsHeader'
import { SettingsIndex, type SettingsIndexGroup } from './SettingsIndex'

/**
 * Portada de Ajustes (2026-09-25). Antes era un `redirect('/settings/reservas')`
 * y se entraba por la segunda de cinco pestañas; ahora el riel trae acá.
 *
 * Cada renglón lleva el valor de hoy para que el dueño vea cómo está sin
 * entrar. Los que salen de la suscripción o del equipo son lecturas que ya
 * hacen Suscripción y Equipo; si alguna falla, el renglón queda sin valor en
 * vez de romper la portada.
 */
export default async function SettingsPage() {
  const { user, tenant } = await requireAdminStaff()
  const s = tenant.settings

  let sub: Awaited<ReturnType<typeof getSubscriptionState>> | null = null
  try {
    sub = await withTenantContext(tenant.id, (tx) => getSubscriptionState(tenant.id, tx))
  } catch {
    sub = null
  }
  const pricing = sub
    ? firstCuotaPricing(await withTenantContext(tenant.id, (tx) => listActivePlans(tx)))
    : null
  const activeStaff = (await listStaffRoster(tenant.id)).filter((m) => m.isActive).length

  const mpConnected = !!tenant.mpConnectedAt
  const deposit = mpConnected && s.requires_deposit !== false
  const hours = deriveScheduleView(tenant.openingHours as LooseOpeningHours).general
  const gaps = getProfileGaps(tenant).length

  const groups: SettingsIndexGroup[] = [
    {
      title: 'Lo que ve el jugador',
      lead: 'En tu página y cuando reserva.',
      icon: Eye,
      items: [
        {
          label: 'Reservas por internet',
          effect: 'Si puede reservar solo y con cuánta anticipación.',
          value:
            s.allow_online_booking !== false ? `Sí · ${s.booking_advance_days ?? 6} días` : 'No',
          icon: Globe,
          tone: s.allow_online_booking !== false ? 'success' : 'neutral',
          href: '/settings/reservas',
        },
        {
          label: 'Horarios',
          effect: 'A qué hora abrís cada día y los días que cerrás.',
          value: `${hours.open} a ${hours.close}`,
          icon: Clock,
          href: '/settings/horarios',
        },
        {
          label: 'Página pública',
          effect: 'Fotos, contacto y dónde queda.',
          value:
            gaps > 0 ? (gaps === 1 ? 'Le falta 1 cosa' : `Le faltan ${gaps} cosas`) : undefined,
          alert: gaps > 0,
          icon: Store,
          tone: 'warning',
          href: '/settings/perfil',
        },
      ],
    },
    {
      title: 'Cobrarle al jugador',
      lead: 'La seña de las reservas por internet.',
      icon: Banknote,
      items: [
        {
          label: 'Seña',
          effect: 'Cuánto paga al reservar y cuándo se le devuelve.',
          value: deposit ? `${s.deposit_percentage ?? 30} %` : 'Sin seña',
          icon: HandCoins,
          tone: deposit ? 'success' : 'neutral',
          href: '/settings/reservas#sena',
        },
        {
          label: 'MercadoPago para cobrar la seña',
          effect: 'Donde te entra esa plata.',
          value: mpConnected ? 'Conectado' : 'Sin conectar',
          icon: Wallet,
          tone: mpConnected ? 'success' : 'warning',
          href: '/settings/reservas#mercado-pago',
        },
      ],
    },
    {
      title: 'Lo que pagás a TurnoGol',
      lead: 'Tu cuota por cancha.',
      icon: Receipt,
      items: [
        {
          label: 'Cuota y pagos',
          effect: pricing
            ? `${formatArs(pricing.priceFirstCourtCents)} la primera cancha y ${formatArs(pricing.priceExtraCourtCents)} cada una de las demás.`
            : 'Cuánto pagás y tus pagos.',
          value: cuotaValue(sub, pricing),
          icon: Receipt,
          tone: cuotaTone(sub),
          href: '/settings/facturacion',
        },
        {
          label: 'Cuenta de MercadoPago con la que pagás',
          effect: 'A qué cuenta te cobramos.',
          icon: CreditCard,
          href: '/settings/facturacion#cuenta-mp',
        },
        {
          label: 'Dar de baja TurnoGol',
          effect: 'Qué pasa y hasta cuándo seguís.',
          icon: LogOut,
          href: '/settings/facturacion#baja',
        },
      ],
    },
    {
      title: 'Vos y tu equipo',
      lead: 'Quién entra y qué le llega.',
      icon: UsersRound,
      items: [
        {
          label: 'Equipo',
          effect: 'Sumar un encargado o sacarlo.',
          value: activeStaff === 1 ? '1 persona' : `${activeStaff} personas`,
          icon: Users,
          href: '/settings/equipo',
        },
        {
          label: 'Email para entrar',
          effect: 'Con el que entrás a TurnoGol.',
          value: user.email,
          icon: Mail,
          plainValue: true,
          href: '/settings/equipo#tu-usuario',
        },
        {
          label: 'Resumen diario',
          effect: 'Lo que entró ayer, a las 8.',
          value: s.daily_summary_email_opt_in ? 'También por email' : 'Solo notificación',
          icon: BellRing,
          href: '/settings/equipo#tu-usuario',
        },
      ],
    },
  ]

  return (
    <>
      <SettingsHeader title="Ajustes" back={false} />
      <SettingsIndex groups={groups} />
    </>
  )
}

/** Lo que pagás hoy, o en qué está la suscripción si no hay un monto que decir. */
function cuotaValue(
  sub: Awaited<ReturnType<typeof getSubscriptionState>> | null,
  pricing: ReturnType<typeof firstCuotaPricing>,
): string | undefined {
  if (!sub) return undefined
  if (sub.status === 'active' && pricing) {
    const { monthlyEffectiveCents } = buildPriceBreakdown({
      billedCourts: sub.billedCourts,
      cycle: sub.billingCycle,
      ...pricing,
    })
    return `${formatArs(monthlyEffectiveCents)} por mes`
  }
  if (sub.status === 'canceled') return 'Te diste de baja'
  return SUBSCRIPTION_STATUS_LABEL[sub.status]
}

/** Verde si anda, ámbar si hay un pago que resolver, rojo si se dio de baja. */
function cuotaTone(sub: Awaited<ReturnType<typeof getSubscriptionState>> | null): StatusTone {
  if (!sub) return 'neutral'
  switch (sub.status) {
    case 'active':
    case 'trialing':
      return 'success'
    case 'past_due':
      return 'warning'
    case 'suspended':
    case 'blocked':
    case 'canceled':
    case 'churned':
      return 'destructive'
  }
}
