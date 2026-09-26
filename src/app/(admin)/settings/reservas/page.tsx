import { requireAdminStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import { effectiveCloseMins, hhmmToMins } from '@/shared/time/operating-day'
import { ReservasPolicyForm } from './ReservasPolicyForm'
import { updateReservasPolicyAction } from './actions'
import { MercadoPagoSenaSection } from './MercadoPagoSenaSection'
import { disconnectMercadoPagoAction } from '../facturacion/actions'
import { SettingsHeader } from '../SettingsHeader'

/** Horas-turno reales que cubre una franja de precio (from–to × cantidad de
 *  días) — `effectiveCloseMins(from, to, true)` reusa la misma aritmética de
 *  medianoche que el resto del repo (nunca se reimplementa a mano) para que
 *  una franja nocturna (ej. 22:00–02:00) sume sus 4 horas y no un negativo. */
function ruleHours(rule: { from: string; to: string; days: string[] }): number {
  const openMins = hhmmToMins(rule.from)
  const closeMins = effectiveCloseMins(rule.from, rule.to, true)
  const durationMins = Math.max(0, closeMins - openMins)
  return (durationMins / 60) * rule.days.length
}

/**
 * Precio "típico" del complejo para el panel "Así lo ve el jugador" (Cambio 2):
 * el precio con más horas-turno reales cubiertas entre todas las franjas de
 * todas las canchas — no el más bajo, confirmado por el dueño, y NO un simple
 * conteo de franjas (una franja angosta de fin de semana no puede "pesar" más
 * que una franja lun-vie que cubre muchas más horas reales). Empate o sin
 * canchas/precios → el primer precio encontrado (o `null`, sin inventar un
 * número); el orden de iteración de `Map` es el de primera aparición, así que
 * el empate ya resuelve solo a "el primero que aparece" sin lógica extra.
 */
function mostCommonPriceCents(courts: Awaited<ReturnType<typeof listCourts>>): number | null {
  const hoursByPrice = new Map<number, number>()
  for (const court of courts) {
    for (const rule of court.pricing.rules) {
      hoursByPrice.set(rule.price, (hoursByPrice.get(rule.price) ?? 0) + ruleHours(rule))
    }
  }
  let best: number | null = null
  let bestHours = 0
  for (const [price, hours] of hoursByPrice) {
    if (hours > bestHours) {
      best = price
      bestHours = hours
    }
  }
  return best
}

export default async function ReservasPolicyPage(
  props: { searchParams?: Promise<{ error?: string; complejo?: string }> } = {},
) {
  const { tenant } = await requireAdminStaff()
  const searchParams = await props.searchParams
  const mpConnected = !!tenant.mpConnectedAt

  const s = tenant.settings
  const courts = await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))
  const examplePriceCents = mostCommonPriceCents(courts)

  return (
    <div className="space-y-6">
      <SettingsHeader title="Reservas y seña" />

      <div className="card-premium rounded-lg p-6">
        <ReservasPolicyForm
          s={s}
          action={updateReservasPolicyAction}
          mpConnected={mpConnected}
          examplePriceCents={examplePriceCents}
        />
      </div>

      <MercadoPagoSenaSection
        connected={mpConnected}
        nickname={tenant.mpNickname}
        requiresDeposit={s.requires_deposit === true}
        error={searchParams?.error}
        conflictTenant={searchParams?.complejo}
        disconnectAction={disconnectMercadoPagoAction}
      />
    </div>
  )
}
