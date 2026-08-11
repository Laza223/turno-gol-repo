import { ScrollTabs } from '@/components/ui/scroll-tabs'

const CLIENTES_TABS = [
  { href: '/jugadores', label: 'Personas' },
  { href: '/abonados', label: 'Turnos fijos' },
]

/**
 * Espacio Clientes (Fase 4). Reemplaza a `JugadoresTabs`, cuya segunda pestaña
 * ("Deudas Pendientes") se fue a Caja → "Plata en la calle", que es la lista
 * única de deuda (turnos + fiados + cuotas de torneo) desde Fase 1.
 *
 * Desde B13 las dos pestañas ya no son dos listas de personas distintas:
 * "Personas" es la lista ÚNICA (con cuenta y sin cuenta, estas últimas
 * derivadas de los turnos fijos), y "Turnos fijos" es la vista operativa de
 * las reservas recurrentes — pausar, reactivar, cancelar una serie.
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
