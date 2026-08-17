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
 * Antes de Fase 4 se llegaba a ambas desde el sidebar (`next/link`), y estas
 * tabs pidieron ese mismo comportamiento con un `clientNav` explícito para no
 * degradar a full reload el ida y vuelta entre las dos pantallas más pesadas del
 * panel. Hoy `ScrollTabs` navega siempre con `next/link` y el opt-in ya no existe.
 */
export function GrillaTabs({ active }: { active: string }) {
  return <ScrollTabs tabs={GRILLA_TABS} activeHref={active} ariaLabel="Vistas de la grilla" />
}
