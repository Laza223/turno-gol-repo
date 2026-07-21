import { ScrollTabs } from '@/components/ui/scroll-tabs'

const JUGADORES_TABS = [
  { href: '/jugadores', label: 'Jugadores' },
  { href: '/jugadores/deudas', label: 'Deudas Pendientes' },
]

/** Tab bar de navegación para la sección Jugadores (/jugadores y /jugadores/deudas). */
export function JugadoresTabs({ active }: { active: string }) {
  return (
    <ScrollTabs
      tabs={JUGADORES_TABS}
      activeHref={active}
      ariaLabel="Secciones de Jugadores"
    />
  )
}
