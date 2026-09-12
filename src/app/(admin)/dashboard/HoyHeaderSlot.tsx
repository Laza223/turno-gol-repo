'use client'

import { AdminHeaderSlot } from '@/components/layout/admin-header-slot'

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
export function HoyHeaderSlot({ dateLabel }: { dateLabel: string }) {
  return (
    <AdminHeaderSlot>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{dateLabel}</p>
    </AdminHeaderSlot>
  )
}
