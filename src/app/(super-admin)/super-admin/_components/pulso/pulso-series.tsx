import type { PlatformActivity } from '@/modules/super-admin/activity.service'
import { DailyBars } from '../daily-bars'
import { PulsoSection } from './pulso-section'

function Serie({ title, days }: { title: string; days: { day: string; value: number }[] }) {
  const total = days.reduce((acc, d) => acc + d.value, 0)
  return (
    <div className="min-w-0">
      <p className="mb-3 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-foreground">{title}</span>
        <span className="tabular-nums text-muted-foreground">{total} en total</span>
      </p>
      <DailyBars days={days} label={`${title}, últimos 14 días`} />
    </div>
  )
}

/** Dos series de 14 días, lado a lado desde `md`. */
export function PulsoSeries({ series }: { series: PlatformActivity['series'] }) {
  return (
    <PulsoSection title="Últimos 14 días">
      <div className="grid grid-cols-1 gap-4 lg:gap-8 md:grid-cols-2">
        <Serie
          title="Jugadores nuevos por día"
          days={series.map((d) => ({ day: d.day, value: d.newPlayers }))}
        />
        <Serie
          title="Reservas online por día"
          days={series.map((d) => ({ day: d.day, value: d.onlineBookings }))}
        />
      </div>
    </PulsoSection>
  )
}
