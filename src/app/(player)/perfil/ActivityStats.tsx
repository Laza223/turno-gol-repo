import { Flame, MapPinned, Trophy } from 'lucide-react'

/**
 * Resumen de actividad del jugador: partidos jugados, complejos visitados y
 * racha de semanas consecutivas con al menos un partido. Solo presentación —
 * los números salen de getPlayerActivity/computeStreakWeeks.
 */
export default function ActivityStats({
  played,
  venues,
  streakWeeks,
}: {
  played: number
  venues: number
  streakWeeks: number
}) {
  const stats = [
    {
      label: 'Partidos jugados',
      value: played,
      detail: null,
      Icon: Trophy,
      accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
    },
    {
      label: 'Complejos visitados',
      value: venues,
      detail: null,
      Icon: MapPinned,
      accent: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
    },
    {
      label: 'Racha actual',
      value: streakWeeks,
      detail: streakWeeks === 1 ? 'semana' : 'semanas',
      Icon: Flame,
      accent:
        streakWeeks > 0
          ? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300'
          : 'bg-muted text-muted-foreground',
    },
  ]

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-3 gap-3">
        {stats.map(({ label, value, detail, Icon, accent }) => (
          <li
            key={label}
            aria-label={`${value} ${detail ? `${detail} de ` : ''}${label.toLowerCase()}`}
            className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-2 py-5 text-center shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/10 motion-reduce:hover:translate-y-0"
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${accent}`}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="font-display text-3xl font-black italic tabular-nums text-foreground">
              {value}
              {detail && (
                <span className="block font-sans text-[11px] font-medium not-italic text-muted-foreground">
                  {detail}
                </span>
              )}
            </span>
            <span className="text-xs leading-tight text-muted-foreground">{label}</span>
          </li>
        ))}
      </ul>

      {played === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Cuando completes tu primer partido vas a ver tu actividad acá.
        </p>
      )}
    </div>
  )
}
