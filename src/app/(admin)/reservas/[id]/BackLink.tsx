'use client'

import type { MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

/**
 * "Volver" del detalle de un turno: vuelve a donde estabas (Hoy, Cuentas, la
 * ficha de un cliente, Reservas) y no siempre a /reservas. Al detalle se llega
 * desde cinco lugares; mandar siempre a Reservas sacaba al que venía de Hoy de
 * la pantalla del mostrador (docs/decisions/2026-09-24-navegacion-panel.md).
 *
 * Sin historial (se abrió en una pestaña nueva o desde un push) el link hace lo
 * que dice su `href` y cae en /reservas. Ctrl/⌘/Shift-clic y la rueda también
 * siguen el `href`: abrir en otra pestaña no puede depender del historial.
 */
export function BackLink() {
  const router = useRouter()

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (window.history.length <= 1) return
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    router.back()
  }

  return (
    <Link
      href="/reservas"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden /> Volver
    </Link>
  )
}
