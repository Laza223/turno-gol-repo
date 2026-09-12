'use client'

import type { ReactNode } from 'react'
import { ScrollTabs } from '@/components/ui/scroll-tabs'
import { AdminHeaderSlot } from '@/components/layout/admin-header-slot'

// H161: Avisos se plegó dentro de Perfil (una sola preferencia no
// justificaba pestaña propia con la pantalla vacía alrededor). Baja de 7 a 6.
// `/settings/avisos` sigue existiendo como redirect de compat a
// `/settings/perfil` — no se le da tab acá para no volver a duplicar la
// preferencia en dos lugares.
const SETTINGS_TABS = [
  { href: '/settings/perfil', label: 'Perfil' },
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/equipo', label: 'Equipo' },
  { href: '/settings/facturacion', label: 'Facturación' },
]

/**
 * Título de la vista Configuración (MASTER §6.8): igual que `GrillaTabs.tsx`,
 * cuelga sus pestañas en la barra superior del panel en vez de abrir un
 * `<h1>`/`PageHeader` propio sobre el contenido — el riel ya dice "Ajustes"
 * y estas 5 pestañas son el único lugar donde la vista se nombra en detalle.
 * `border-b-0` anula el borde inferior de `ScrollTabs` (pensado para vivir
 * en el body, no en una barra de 60px que ya tiene el suyo).
 *
 * `actions` cuelga a la derecha de las pestañas, en el mismo hueco — hoy solo
 * lo usa Equipo ("Invitar al equipo"), que antes vivía en el `actions` del
 * `PageHeader` que esta vista ya no tiene.
 */
export function SettingsTabs({ active, actions }: { active: string; actions?: ReactNode }) {
  return (
    <AdminHeaderSlot>
      <ScrollTabs
        tabs={SETTINGS_TABS}
        activeHref={active}
        ariaLabel="Secciones de configuración"
        className="min-w-0 flex-1 border-b-0"
      />
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </AdminHeaderSlot>
  )
}
