'use client'

import { ShoppingBag } from 'lucide-react'
import { AdminHeaderSlot } from '@/components/layout/admin-header-slot'
import { useVender } from './_components/VenderProvider'

/**
 * Lo único que Hoy le pide al armazón: el día operativo en el hueco de la
 * barra superior (MASTER §6.8).
 *
 * Reemplaza a la banda `PageHeader` que esta vista tenía encima del contenido
 * y que costaba ~110px de la primera pantalla en 375px para repetir lo que el
 * riel ya dice. Es el mismo movimiento que hicieron la Grilla (`GrillaTabs`) y
 * Configuración (`SettingsTabs`).
 *
 * Va la FECHA y no el título: la regla del hueco es "el control de la vista,
 * no su título" (MASTER §6.8) — un `<h1>Hoy</h1>` acá arriba sería otra vez la
 * fila que el rediseño del armazón vino a sacar. La fecha sí es dato de la
 * vista: dice qué día operativo se está mirando, igual que la tira de semana
 * de la Grilla. El nombre de la pantalla lo pone el riel, y el `<h1>` para
 * lectores de pantalla queda en el contenido.
 */
export function HoyHeaderSlot({
  dateLabel,
  shortDateLabel,
}: {
  dateLabel: string
  /** "jue 24 sep": en el teléfono, al lado del logo, la larga quedaba en "jue 24 d…". */
  shortDateLabel: string
}) {
  const { setOpen } = useVender()
  return (
    <AdminHeaderSlot>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        <span className="tracking-tight sm:hidden">{shortDateLabel}</span>
        <span className="max-sm:hidden">{dateLabel}</span>
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Solo el ícono en el teléfono: con el logo y el menú de tema a los costados, un botón
        // con texto le dejaba a la fecha ~25 px y la aplastaba. El nombre accesible es el mismo.
        // En todos los anchos (2026-09-25): la venta es un modal y ya no hay columna fija.
        // La V también lo abre; la tecla se muestra solo donde hay teclado.
        aria-keyshortcuts="V"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto sm:px-3.5 md:h-10"
      >
        <ShoppingBag aria-hidden className="h-4 w-4" />
        <span className="max-sm:sr-only">Vender</span>
        <kbd
          aria-hidden
          className="hidden rounded bg-white/20 px-1.5 font-sans text-[11px] font-medium pointer-fine:lg:inline"
        >
          V
        </kbd>
      </button>
    </AdminHeaderSlot>
  )
}
