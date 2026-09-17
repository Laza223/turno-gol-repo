'use client'

import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { AdminThemeMenu } from '@/components/admin/AdminThemeMenu'
import { ADMIN_HEADER_SLOT_ID } from './admin-header-slot'

interface AdminHeaderProps {
  /** Nombre del complejo: era la tarjeta de la barra lateral vieja. */
  tenantName: string
  /**
   * Destino del logo en mobile (donde el riel no se ve): el espacio "casa"
   * del rol — `/dashboard` para el dueño, `/grilla` para el encargado.
   */
  homeHref?: string
}

/**
 * Barra superior de 60 px. Antes medía 64 y sólo repetía marca, email y "Salir";
 * la cuenta se mudó al pie del riel, así que lo único fijo que queda es el
 * nombre del complejo. Todo el resto del ancho es el hueco de
 * {@link AdminHeaderSlot}: ahí cada vista cuelga lo suyo (fecha, pestañas,
 * semana), que es lo que saca cuatro filas de encabezado de la Grilla.
 */
export function AdminHeader({ tenantName, homeHref = '/grilla' }: AdminHeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-20 flex h-[calc(3.75rem+env(safe-area-inset-top))] items-center gap-4 border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:left-[72px]">
      {/* Marca en mobile: acá no hay hamburguesa (Fase 4 — la navegación
          primaria es la barra inferior) ni riel, así que sin esto el panel se
          queda sin ninguna marca arriba. */}
      <Link
        href={homeHref}
        className="lg:hidden rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Logo variant="horizontal" textClassName="text-foreground" />
      </Link>

      {/* Sin modificador de opacidad sobre `--muted-foreground`: está calibrado
          a 4.93:1 (globals.css) y cualquier `/N` lo deja bajo AA. */}
      <span className="hidden shrink-0 truncate text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground lg:block lg:max-w-48">
        {tenantName}
      </span>

      {/* Lo que cuelga cada vista (AdminHeaderSlot): la Grilla pone acá su
          segmento, la semana y el chip de lo pendiente. Vacío no ocupa nada
          visible, pero el `flex-1` mantiene el resto del header a la derecha. */}
      <div id={ADMIN_HEADER_SLOT_ID} className="flex min-w-0 flex-1 items-center gap-3" />

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <AdminThemeMenu />
      </div>
    </header>
  )
}
