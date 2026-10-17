import { Building2, CalendarCheck, ClipboardList, UserPlus } from 'lucide-react'
import { StatCard } from '@/components/admin/StatCard'
import type { ActivityWindow, PlatformActivity } from '@/modules/super-admin/activity.service'

const PREVIOUS_LABEL: Record<ActivityWindow, string> = {
  hoy: 'Ayer',
  '7d': 'Semana anterior',
  '30d': '30 días anteriores',
}

/**
 * Los cuatro números del período. Se muestra la ventana anterior como
 * referencia ("Ayer: 3") y NO un porcentaje, a propósito: con cifras tan
 * chicas (de 1 a 3 da "+200 %") el porcentaje asusta sin informar. Mismo
 * criterio que Métricas (MonthBoard.tsx).
 */
export function PulsoStats({
  activity,
}: {
  activity: Pick<PlatformActivity, 'window' | 'current' | 'previous'>
}) {
  const { current, previous, window } = activity
  const ref = PREVIOUS_LABEL[window]
  const icon = 'h-5 w-5'
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <StatCard
        label="Jugadores nuevos"
        value={current.newPlayers}
        icon={<UserPlus className={icon} aria-hidden="true" />}
        sub={`${ref}: ${previous.newPlayers}`}
      />
      <StatCard
        label="Reservas online"
        value={current.onlineBookings}
        icon={<CalendarCheck className={icon} aria-hidden="true" />}
        sub={`${ref}: ${previous.onlineBookings}`}
      />
      <StatCard
        label="Cargadas por el complejo"
        value={current.staffBookings}
        icon={<ClipboardList className={icon} aria-hidden="true" />}
        sub={`${ref}: ${previous.staffBookings}`}
      />
      <StatCard
        label="Complejos con movimiento"
        value={current.activeTenants}
        icon={<Building2 className={icon} aria-hidden="true" />}
        sub={`${ref}: ${previous.activeTenants}`}
      />
    </div>
  )
}
