'use client'

import type { MouseEvent, ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

type Props = {
  href: string
  children: ReactNode
  /**
   * Con historial, vuelve por él (`router.back()`) y solo cae en `href` sin
   * historial o al abrir en otra pestaña. Usarlo cuando "Volver" puede
   * significar distintos orígenes (ver `/reservas/[id]`, con cinco entradas
   * posibles — docs/decisions/2026-09-24-navegacion-panel.md). Sin `smart`,
   * el link siempre va a `href`.
   */
  smart?: boolean
}

/**
 * "Volver" del panel: ícono + texto, un solo estilo en toda la app.
 *
 * Sin historial (se abrió en una pestaña nueva o desde un push) el link hace
 * lo que dice su `href`. Ctrl/⌘/Shift-clic y la rueda también siguen el
 * `href`: abrir en otra pestaña no puede depender del historial.
 */
export function BackLink({ href, children, smart = false }: Props) {
  const router = useRouter()

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!smart) return
    if (window.history.length <= 1) return
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    router.back()
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden /> {children}
    </Link>
  )
}
