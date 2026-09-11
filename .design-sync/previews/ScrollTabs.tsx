import { ScrollTabs } from 'turnogol'

/** Las cinco pestañas de Configuración, en su orden real. Canchas ya no está
 *  acá (es un espacio propio del menú desde 2026-09-10) y Avisos se plegó
 *  dentro de Perfil. */
export function Configuracion() {
  return (
    <div className="w-full max-w-2xl">
      <ScrollTabs
        ariaLabel="Secciones de Configuración"
        activeHref="/settings/horarios"
        tabs={[
          { href: '/settings/perfil', label: 'Perfil' },
          { href: '/settings/reservas', label: 'Reservas' },
          { href: '/settings/horarios', label: 'Horarios' },
          { href: '/settings/equipo', label: 'Equipo' },
          { href: '/settings/facturacion', label: 'Facturación' },
        ]}
      />
    </div>
  )
}
