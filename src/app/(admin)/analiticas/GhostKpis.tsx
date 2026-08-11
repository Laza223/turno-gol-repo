import Link from 'next/link'
import { CalendarCheck, SlidersHorizontal, TrendingUp, Wallet } from 'lucide-react'
import { StatCard } from '@/components/admin/StatCard'

/**
 * "Primera-vez espectral" (§7.2 MASTER, nombrada explícitamente para esta vista).
 *
 * Sin `opacity-50` sobre el wrapper: `text-foreground` (valor del StatCard) al
 * 50% de opacidad compone ~3.79:1 contra el fondo blanco — bajo el mínimo AA
 * 4.5:1. El look "fantasma" sale de renderizar el valor en
 * `text-muted-foreground` (ya AA) y atenuar solo el glifo del ícono
 * (decorativo, sin texto). Mismo criterio que GhostTopSlots en /metricas.
 */
export function GhostKpis() {
  const ghosts = [
    {
      label: 'Ingresos',
      value: '$ 85.000,00',
      icon: <TrendingUp className="h-4 w-4 opacity-40" aria-hidden="true" />,
      accent: 'emerald' as const,
    },
    {
      label: 'Ajustes',
      value: '$ 0,00',
      icon: <SlidersHorizontal className="h-4 w-4 opacity-40" aria-hidden="true" />,
      accent: 'slate' as const,
    },
    {
      label: 'Saldo',
      value: '$ 85.000,00',
      icon: <Wallet className="h-4 w-4 opacity-40" aria-hidden="true" />,
      accent: 'emerald' as const,
    },
    {
      label: 'Reservas',
      value: '32',
      icon: <CalendarCheck className="h-4 w-4 opacity-40" aria-hidden="true" />,
      accent: 'slate' as const,
    },
  ]

  return (
    <div className="card-premium rounded-lg p-5">
      <p className="text-sm font-medium text-muted-foreground">
        <span aria-hidden="true">✦ </span>Así se verá tu mes cuando cargues reservas
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4 select-none sm:grid-cols-4" aria-hidden="true">
        {ghosts.map((g) => (
          <StatCard
            key={g.label}
            label={g.label}
            value={<span className="text-muted-foreground">{g.value}</span>}
            icon={g.icon}
            accent={g.accent}
            className="pointer-events-none"
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Todavía no hay movimientos en este período.
      </p>
      <Link
        href="/grilla"
        className="mt-2 inline-block text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
      >
        Cargá tu primera reserva desde la grilla
      </Link>
    </div>
  )
}
