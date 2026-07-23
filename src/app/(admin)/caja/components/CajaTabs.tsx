import { ScrollTabs } from '@/components/ui/scroll-tabs'

const CAJA_TABS = [
  { href: '/caja', label: 'Caja del día' },
  { href: '/caja/cantina', label: 'Cantina' },
  { href: '/caja/productos', label: 'Productos y stock' },
]

/** Tab bar única de /caja (mismo patrón que SettingsTabs). */
export function CajaTabs({ active }: { active: string }) {
  return <ScrollTabs tabs={CAJA_TABS} activeHref={active} ariaLabel="Secciones de caja y cantina" />
}
