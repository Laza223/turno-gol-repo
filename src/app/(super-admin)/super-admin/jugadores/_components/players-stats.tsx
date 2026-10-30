import { LogIn, UserPlus, Users } from 'lucide-react'
import { StatCard } from '@/components/admin/StatCard'
import type { PlayerStats } from '@/modules/super-admin/players.service'
import { DailyBars } from '../../_components/daily-bars'

const ICON = 'h-4 w-4'

/** Números de arriba de Jugadores + barras de altas de los últimos 30 días. */
export function PlayersStats({ stats }: { stats: PlayerStats }) {
  return (
    <section aria-label="Resumen de jugadores" className="space-y-3 lg:space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Nuevos hoy"
          value={stats.newToday}
          icon={<UserPlus className={ICON} aria-hidden="true" />}
        />
        <StatCard
          label="Nuevos en 7 días"
          value={stats.new7d}
          icon={<UserPlus className={ICON} aria-hidden="true" />}
        />
        <StatCard
          label="Nuevos en 30 días"
          value={stats.new30d}
          icon={<Users className={ICON} aria-hidden="true" />}
        />
        <StatCard
          label="Entraron en 7 días"
          value={stats.active7d}
          sub="Iniciaron sesión"
          icon={<LogIn className={ICON} aria-hidden="true" />}
        />
      </div>
      <div className="rounded-xl border border-border/60 bg-card p-4 lg:p-5 shadow-xs">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Altas por día</h2>
        <DailyBars
          label="Jugadores nuevos por día"
          days={stats.series.map((d) => ({ day: d.day, value: d.newPlayers }))}
        />
      </div>
    </section>
  )
}
