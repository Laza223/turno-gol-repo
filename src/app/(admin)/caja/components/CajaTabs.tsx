'use client'

import type { ReactNode } from 'react'
import { ScrollTabs } from '@/components/ui/scroll-tabs'
import { AdminHeaderSlot } from '@/components/layout/admin-header-slot'

const CAJA_TABS = [
  // Dos destinos por audiencia y frecuencia, no cuatro por tabla de la base.
  // Vender se fue a Hoy (docs/decisions/2026-09-24-navegacion-panel.md).
  // "Cuentas" es el libro del dueño. Deudas y Devolvés viven ahí
  // juntas como DOS listas con DOS totales: son las dos direcciones de la plata
  // pendiente y no se netean nunca (el total de Deudas tiene fuente única en
  // street-money.service.ts, y restarle lo que el complejo debe lo rompería).
  { href: '/caja/cuentas', label: 'Cuentas' },
  { href: '/caja/productos', label: 'Productos' },
]

/**
 * El aviso de stock bajo: un punto ámbar y nada más.
 *
 * Reponer es una decisión semanal, no una urgencia — un banner, un toast o un
 * contador rojo la tratarían como si lo fuera y entrenarían a ignorar el
 * canal. El texto va en `sr-only` porque un aviso que solo existe como color no
 * llega a quien no ve color (MASTER §10), y de paso el lector de pantalla dice
 * cuántos son, que es más de lo que muestra el punto.
 */
function LowStockDot({ count }: { count: number }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400"
      />
      <span className="sr-only">
        — {count} {count === 1 ? 'producto para reponer' : 'productos para reponer'}
      </span>
    </>
  )
}

/**
 * Título de la vista Caja (MASTER §6.8): igual que `SettingsTabs` y
 * `GrillaTabs`, cuelga sus pestañas en la barra superior del panel en vez de
 * abrir un `PageHeader` propio sobre el contenido. El riel ya dice "Caja" y
 * estos dos destinos son el único lugar donde la vista se nombra en detalle.
 * `border-b-0` anula el borde inferior de `ScrollTabs`, pensado para vivir en
 * el body y no en una barra de 60 px que ya tiene el suyo.
 *
 * `actions` cuelga a la derecha, en el mismo hueco.
 *
 * `lowStock` pinta el punto de aviso en "Productos" desde CUALQUIERA de los
 * dos destinos: el dueño que entra a mirar deudas se entera de que hay algo
 * para reponer sin tener que sospecharlo y abrir la pestaña.
 */
export function CajaTabs({
  active,
  actions,
  lowStock = 0,
}: {
  active: string
  actions?: ReactNode
  /** Productos activos que piden reposición (`countLowStock` / `lowStockCount`). */
  lowStock?: number
}) {
  const tabs =
    lowStock > 0
      ? CAJA_TABS.map((t) =>
          t.href === '/caja/productos' ? { ...t, badge: <LowStockDot count={lowStock} /> } : t,
        )
      : CAJA_TABS

  return (
    <AdminHeaderSlot>
      <ScrollTabs
        tabs={tabs}
        activeHref={active}
        ariaLabel="Secciones de caja y cantina"
        className="min-w-0 flex-1 border-b-0"
      />
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </AdminHeaderSlot>
  )
}
