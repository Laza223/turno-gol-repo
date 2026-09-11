'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AdminHeaderSlot } from '@/components/layout/admin-header-slot'

const GRILLA_TABS = [
  { href: '/grilla', label: 'Grilla' },
  { href: '/reservas', label: 'Reservas' },
]

/**
 * Las dos vistas del espacio Grilla (Fase 4). La matriz responde "¿qué cancha
 * está libre ahora?" y la lista responde "¿qué pasó con ESTA reserva?" — mismo
 * hecho, dos lentes (P5), no dos módulos. "Reservas" dejó de ser ítem del
 * sidebar; su URL no se movió.
 *
 * Vive en la barra superior del panel, no arriba del contenido: era una de las
 * cuatro filas de encabezado que la matriz tenía por encima y que nadie leía —
 * el riel ya dice en qué espacio estás. Por eso el rótulo de la matriz pasó de
 * "Calendario" a "Grilla": el título de la pantalla desapareció y este segmento
 * quedó como el único lugar donde se nombra.
 */
export function GrillaTabs({ active }: { active: string }) {
  return (
    <AdminHeaderSlot>
      <nav
        aria-label="Vistas de la grilla"
        className="flex shrink-0 gap-0.5 rounded-[9px] bg-muted p-[3px]"
      >
        {GRILLA_TABS.map((tab) => {
          const isActive = tab.href === active
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex h-8 items-center rounded-[7px] px-3 text-[13px] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'bg-card font-semibold text-foreground shadow-xs'
                  : 'font-medium text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </AdminHeaderSlot>
  )
}
