import { ScrollTabs } from '@/components/ui/scroll-tabs'

const SETTINGS_TABS = [
  { href: '/settings/perfil', label: 'Perfil' },
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/canchas', label: 'Canchas' },
  { href: '/settings/equipo', label: 'Equipo' },
  { href: '/settings/facturacion', label: 'Facturación' },
]

/** Tab bar única de /settings (antes duplicada en las 4 páginas). */
export function SettingsTabs({ active }: { active: string }) {
  return (
    <ScrollTabs tabs={SETTINGS_TABS} activeHref={active} ariaLabel="Secciones de configuración" />
  )
}
