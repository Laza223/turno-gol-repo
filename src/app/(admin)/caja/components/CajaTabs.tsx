import { ScrollTabs } from '@/components/ui/scroll-tabs'

const CAJA_TABS = [
  { href: '/caja', label: 'Cantina' },
  { href: '/caja/deudas', label: 'Deudas' },
  // Lo que el complejo DEBE, al lado de lo que le deben. Son opuestos y por eso
  // están separados: el total de "Deudas" tiene una fuente única y mezclarlos
  // rompería el invariante que la compara por dos caminos.
  { href: '/caja/devoluciones', label: 'Devoluciones' },
  { href: '/caja/productos', label: 'Productos y stock' },
]

/** Tab bar única de /caja (mismo patrón que SettingsTabs). */
export function CajaTabs({ active }: { active: string }) {
  return <ScrollTabs tabs={CAJA_TABS} activeHref={active} ariaLabel="Secciones de caja y cantina" />
}
