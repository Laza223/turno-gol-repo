import { ScrollTabs } from '@/components/ui/scroll-tabs'

const CLIENTES_TABS = [
  { href: '/jugadores', label: 'Jugadores' },
  { href: '/abonados', label: 'Turnos fijos' },
]

/**
 * Espacio Clientes (Fase 4). Reemplaza a `JugadoresTabs`, cuya segunda pestaña
 * ("Deudas Pendientes") se fue a Caja → "Plata en la calle", que es la lista
 * única de deuda (turnos + fiados + cuotas de torneo) desde Fase 1.
 *
 * OJO — esto es la CÁSCARA de navegación, no la fusión de Clientes: por dentro
 * siguen siendo dos listas de personas distintas. La fusión real (ficha ligera
 * de invitados + vinculación manual, doc de fase §1) queda pendiente y no
 * necesita volver a tocar el menú cuando llegue.
 */
export function ClientesTabs({ active }: { active: string }) {
  return (
    <ScrollTabs
      tabs={CLIENTES_TABS}
      activeHref={active}
      ariaLabel="Secciones de clientes"
      clientNav
    />
  )
}
