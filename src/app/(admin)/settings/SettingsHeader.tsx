import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { AdminHeaderSlot } from '@/components/layout/admin-header-slot'

/**
 * Barra superior de Ajustes (MASTER §6.8: la vista cuelga su control en el
 * hueco del header, no abre un encabezado propio).
 *
 * Reemplaza a las pestañas desde el 2026-09-25: Ajustes pasó a ser una
 * portada (`/settings`) con cuatro grupos, y cada página cuelga acá
 * "‹ Ajustes" para volver y su nombre. En el teléfono queda solo la flecha
 * —con "Ajustes" como nombre accesible—: con el logo y el botón de tema a los
 * costados, "Ajustes" + "Reservas y seña" no entraban en una línea.
 *
 * `back={false}` es la portada: dice "Ajustes" y nada más.
 *
 * El `<h1>` va en el contenido y oculto: la barra es navegación, y el lector
 * de pantalla igual tiene que encontrar el título de la página.
 */
export function SettingsHeader({
  title,
  back = true,
  actions,
}: {
  title: string
  back?: boolean
  /** Botones a la derecha de la barra (hoy solo Equipo: agregar a alguien). */
  actions?: ReactNode
}) {
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      <AdminHeaderSlot>
        {back ? (
          <nav aria-label="Ajustes" className="flex min-w-0 flex-1 items-center gap-1">
            <Link
              href="/settings"
              className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-0.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:justify-start sm:pr-2 sm:pl-1 md:h-9"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              <span className="max-sm:sr-only">Ajustes</span>
            </Link>
            {/* En el teléfono el hueco deja ~110 px: "Reservas y seña" se cortaba
                en "Reservas…". Dos líneas entran en los 60 px de la barra. */}
            <span
              aria-current="page"
              className="text-sm leading-tight font-semibold text-foreground max-sm:line-clamp-2 sm:truncate"
            >
              {title}
            </span>
          </nav>
        ) : (
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</p>
        )}
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </AdminHeaderSlot>
    </>
  )
}
