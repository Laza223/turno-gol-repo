import { ScrollTabs } from '@/components/ui/scroll-tabs'

const CAJA_TABS = [
  { href: '/caja', label: 'Caja del día' },
  { href: '/caja/deudas', label: 'Plata en la calle' },
  // Lo que el complejo DEBE, al lado de lo que le deben. Son opuestos y por eso
  // están separados: el total de "Plata en la calle" tiene una fuente única y
  // mezclarlos rompería el invariante que la compara por dos caminos.
  { href: '/caja/devoluciones', label: 'Devoluciones' },
  { href: '/caja/cantina', label: 'Cantina' },
  { href: '/caja/productos', label: 'Productos y stock' },
]

/** Tab bar única de /caja (mismo patrón que SettingsTabs). */
export function CajaTabs({ active }: { active: string }) {
  return <ScrollTabs tabs={CAJA_TABS} activeHref={active} ariaLabel="Secciones de caja y cantina" />
}
