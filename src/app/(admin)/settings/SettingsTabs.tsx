import { ScrollTabs } from '@/components/ui/scroll-tabs'

// H161: Avisos se plegó dentro de Perfil (una sola preferencia no
// justificaba pestaña propia con la pantalla vacía alrededor). Baja de 7 a 6.
// `/settings/avisos` sigue existiendo como redirect de compat a
// `/settings/perfil` — no se le da tab acá para no volver a duplicar la
// preferencia en dos lugares.
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
