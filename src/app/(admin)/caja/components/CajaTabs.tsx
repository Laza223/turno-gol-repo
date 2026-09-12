import { ScrollTabs } from '@/components/ui/scroll-tabs'

const CAJA_TABS = [
  // Tres destinos por audiencia y frecuencia, no cuatro por tabla de la base.
  // "Vender" es la caja registradora del encargado y no muestra ningún total
  // agregado; "Cuentas" es el libro del dueño. Deudas y Devolvés viven ahí
  // juntas como DOS listas con DOS totales: son las dos direcciones de la plata
  // pendiente y no se netean nunca (el total de Deudas tiene fuente única en
  // street-money.service.ts, y restarle lo que el complejo debe lo rompería).
  { href: '/caja', label: 'Vender' },
  { href: '/caja/cuentas', label: 'Cuentas' },
  { href: '/caja/productos', label: 'Productos' },
]

/** Tab bar única de /caja (mismo patrón que SettingsTabs). */
export function CajaTabs({ active }: { active: string }) {
  return <ScrollTabs tabs={CAJA_TABS} activeHref={active} ariaLabel="Secciones de caja y cantina" />
}
