'use client'

import type { ReactNode } from 'react'
import { ScrollTabs } from '@/components/ui/scroll-tabs'
import { AdminHeaderSlot } from '@/components/layout/admin-header-slot'

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

/**
 * Título de la vista Caja (MASTER §6.8): igual que `SettingsTabs` y
 * `GrillaTabs`, cuelga sus pestañas en la barra superior del panel en vez de
 * abrir un `PageHeader` propio sobre el contenido. El riel ya dice "Caja" y
 * estos tres destinos son el único lugar donde la vista se nombra en detalle.
 * `border-b-0` anula el borde inferior de `ScrollTabs`, pensado para vivir en
 * el body y no en una barra de 60 px que ya tiene el suyo.
 *
 * `actions` cuelga a la derecha, en el mismo hueco: hoy lo usa Cuentas para el
 * rótulo del día de trabajo y el botón "Agregar movimiento", que antes vivían
 * en el `PageHeader` que esta vista ya no tiene.
 */
export function CajaTabs({ active, actions }: { active: string; actions?: ReactNode }) {
  return (
    <AdminHeaderSlot>
      <ScrollTabs
        tabs={CAJA_TABS}
        activeHref={active}
        ariaLabel="Secciones de caja y cantina"
        className="min-w-0 flex-1 border-b-0"
      />
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </AdminHeaderSlot>
  )
}
