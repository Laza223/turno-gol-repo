import { ScrollTabs } from '@/components/ui/scroll-tabs'

const GRILLA_TABS = [
  { href: '/grilla', label: 'Calendario' },
  { href: '/reservas', label: 'Lista' },
]

/**
 * Las dos vistas del espacio Grilla (Fase 4). La matriz responde "¿qué cancha
 * está libre ahora?" y la lista responde "¿qué pasó con ESTA reserva?" — mismo
 * hecho, dos lentes (P5), no dos módulos. "Reservas" dejó de ser ítem del
 * sidebar; su URL no se movió.
 *
 * `clientNav`: antes de Fase 4 se llegaba a ambas desde el sidebar (`next/link`).
 * Con `<a>` nativo el ida y vuelta entre las dos pantallas más pesadas del
 * panel sería un full reload — peor que hoy.
 */
export function GrillaTabs({ active }: { active: string }) {
  return (
    <ScrollTabs tabs={GRILLA_TABS} activeHref={active} ariaLabel="Vistas de la grilla" clientNav />
  )
}
