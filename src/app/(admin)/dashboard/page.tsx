import { redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'
import { daySlotsFor } from '@/lib/dashboard/day-bookings'
import { getHoyData } from '@/modules/home/home.service'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import { DashboardTour } from '@/components/dashboard/dashboard-tour'
import { WhileYouWereAway } from '@/components/dashboard/WhileYouWereAway'
import { NeedsAttention } from '@/components/dashboard/NeedsAttention'
import { ProximosTurnos } from '@/components/dashboard/ProximosTurnos'
import { HoyHeaderSlot } from './HoyHeaderSlot'
import { getChecklistState } from './queries'
import {
  markPublicLinkSharedAction,
  markTourSeenAction,
  markChecklistDismissedAction,
} from './actions'

/** Fecha de hoy formato medio §8.3: "mié 2 de julio" (nunca ISO ni coma).
 * Armado por partes: el string completo del locale varía entre versiones de ICU
 * (coma, "de" incluido o no) y acá el formato es contrato de diseño. */
function todayMediumArt(now: Date): string {
  const tz = { timeZone: 'America/Argentina/Buenos_Aires' } as const
  const weekday = now.toLocaleDateString('es-AR', { weekday: 'short', ...tz }).replace('.', '')
  const day = now.toLocaleDateString('es-AR', { day: 'numeric', ...tz })
  const month = now.toLocaleDateString('es-AR', { month: 'long', ...tz })
  return `${weekday} ${day} de ${month}`
}

export default async function DashboardPage() {
  // B10 — `requireOperatorStaff` y no `requireAdminStaff`, aunque la pantalla
  // sea solo-admin: `requireAdminStaff` rebota al manager A `/dashboard`, que es
  // ESTA página, así que sería un loop de redirects. El guard operator deja
  // pasar a los dos y devuelve el rol ya leído, que es justo lo que hace falta
  // para el rebote de abajo — y ahorra el `getStaffRole` suelto que había acá.
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/login')
  const { tenant, role } = auth

  // D5 (docs/planning/2026-08-01-decisiones-de-fase-v2.md): "Hoy" es solo del
  // admin — no existe versión manager. Mismo patrón que requireAdminStaff
  // (guards.ts:124), destino invertido: acá rebota A la grilla en vez de
  // rebotar DESDE ella. Los 9 call-sites que hacen redirect('/dashboard')
  // genérico (login, onboarding, etc.) siguen aterrizando acá sin tocarlos —
  // el rebote ocurre en el primer render de esta página.
  if (role !== 'admin') redirect('/grilla')

  const cutoffMins = nightCutoffMins(tenant.openingHours, tenant.closesNextDay)
  // Un solo reloj para todo el render: el día operativo y el "hace N min" de
  // cada alerta tienen que salir del mismo instante, o una alerta creada entre
  // las dos lecturas se dibuja con un relativo negativo.
  const now = new Date()
  const date = operatingDateOf(now, cutoffMins)

  const [data, checklistState] = await Promise.all([
    withTenantContext(tenant.id, (tx) =>
      getHoyData(tenant.id, tx, {
        date,
        cutoffMins,
        openingHours: tenant.openingHours,
        closedDates: tenant.closedDates,
        closesNextDay: tenant.closesNextDay,
      }),
    ),
    getChecklistState(tenant, tenant.settings, !!tenant.mpConnectedAt),
  ])

  // Todos los pasos de la checklist, no solo 2 de 7 (bug: antes el complejo
  // podía dar "por terminado" el onboarding con canchas/horarios sin cargar).
  const allDone = Object.values(checklistState).every(Boolean)
  const showChecklist = !allDone && !tenant.settings.checklist_dismissed_at
  const showTour =
    tenant.settings.onboarding_completed === true && !tenant.settings.admin_tour_seen_at

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const { numbers, whileYouWereAway, needsAttention, upcoming } = data

  // `dayIsClosed` se recalcula acá (función pura, sin DB) porque getHoyData no
  // distingue "día cerrado" de "0 disponible": los dos casos llegan con
  // `available = 0` y se leen distinto en pantalla.
  const dayIsClosed =
    daySlotsFor(date, tenant.openingHours, tenant.closedDates ?? [], tenant.closesNextDay)
      .length === 0

  return (
    <div className="space-y-4">
      {showTour && <DashboardTour action={markTourSeenAction} />}

      {/* La banda `PageHeader` se fue (rediseño 2026-09-12): el riel ya dice
          "Hoy" y la fecha cuelga del hueco de la barra superior, que es la
          regla del armazón desde MASTER §6.8 y lo que ya hicieron la Grilla y
          Configuración. En 375px eso devuelve ~110px a la primera pantalla.
          El `<h1>` sigue existiendo para lectores de pantalla y para el
          esquema de encabezados: lo que se eliminó es la FILA, no el título. */}
      <HoyHeaderSlot dateLabel={todayMediumArt(now)} />
      <h1 className="sr-only">Hoy</h1>

      {/* ORDEN (rediseño 2026-09-12): lo que exige acción va primero y siempre
          en el mismo lugar. Antes las alertas quedaban entre dos bloques de
          lectura —lo crítico en el medio, justo lo que MASTER §9 (serial
          position) dice que no—, así que a las 17:00, con el cliente parado en
          el mostrador, el botón de cobrar aparecía después de scrollear el
          tablero entero. Vacío, este bloque mide una línea de 44px y no
          empuja nada. */}
      <div className="card-entrance">
        <NeedsAttention items={needsAttention} nowMs={now.getTime()} />
      </div>

      {showChecklist && (
        <div className="card-entrance" style={{ animationDelay: '60ms' }}>
          <OnboardingChecklist
            state={checklistState}
            tenantSlug={tenant.slug}
            appUrl={appUrl}
            action={markPublicLinkSharedAction}
            onDismiss={markChecklistDismissedAction}
            staffRole={role}
          />
        </div>
      )}

      {/* H010 (auditoría de coherencia, 2026-09-10): acá había tres tarjetas de
          métrica, y dos de ellas —"Cobrado hoy" y "Deudas"— eran el mismo
          componente con el mismo dato que Caja muestra un click más allá. Hoy
          dejó de ser un tablero de números y pasó a ser la pantalla operativa:
          qué falta jugar, qué hay que resolver, y qué pasó sin el dueño. La
          ocupación sobrevive como subtítulo del bloque de turnos, que es el
          único lugar donde ese porcentaje significa algo. */}
      <div className="card-entrance" style={{ animationDelay: '120ms' }}>
        <ProximosTurnos courts={upcoming} occupancy={numbers.occupancy} dayIsClosed={dayIsClosed} />
      </div>

      <div className="card-entrance" style={{ animationDelay: '180ms' }}>
        <WhileYouWereAway items={whileYouWereAway} />
      </div>
    </div>
  )
}
