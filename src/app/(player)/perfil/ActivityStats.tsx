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
      accent: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Complejos visitados',
      value: venues,
      detail: null,
      Icon: MapPinned,
      accent: 'bg-sky-50 text-sky-600',
    },
    {
      label: 'Racha actual',
      value: streakWeeks,
      detail: streakWeeks === 1 ? 'semana' : 'semanas',
      Icon: Flame,
      accent: streakWeeks > 0 ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-400',
    },
  ]

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-3 gap-3">
        {stats.map(({ label, value, detail, Icon, accent }) => (
          <li
            key={label}
            aria-label={`${value} ${detail ? `${detail} de ` : ''}${label.toLowerCase()}`}
            className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-4 text-center shadow-sm"
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${accent}`}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-2xl font-bold tabular-nums text-slate-900">
              {value}
              {detail && (
                <span className="block text-[11px] font-medium text-slate-500">{detail}</span>
              )}
            </span>
            <span className="text-xs text-slate-500 leading-tight">{label}</span>
          </li>
        ))}
      </ul>

      {played === 0 && (
        <p className="text-center text-sm text-slate-400">
          Cuando completes tu primer partido vas a ver tu actividad acá.
        </p>
      )}
    </div>
  )
}
