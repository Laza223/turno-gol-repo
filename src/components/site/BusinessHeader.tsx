'use client'

import Link from 'next/link'
import { Menu } from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const MOBILE_LINK_CLS =
  'flex w-full items-center rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-200 focus:text-white'

/**
 * Cabecera B2B (para-complejos) — pill flotante dark-premium, mismo lenguaje
 * visual que el header overlay del jugador, pero con links de staff:
 * Ingresar → /login (password), Empezar gratis → /register. Sin nav de jugador.
 *
 * MEJORA-UX QA: en mobile (<640px) los 4 links (Funciones/Precios/Blog/
 * Ingresar) desaparecían del todo (`hidden ... sm:inline-flex`) sin ningún
 * menú que los reemplazara — solo quedaban logo + "Empezar gratis", y la
 * única forma de llegar a ellos era scrollear hasta el footer. El menú
 * hamburguesa (`DropdownMenu`, ya usado en el resto del repo) los reagrupa;
 * `sm:hidden` en el trigger porque en sm+ siguen viviendo inline como
 * siempre.
 */
export default function BusinessHeader() {
  return (
    // pt combina el respiro visual con el safe-area del notch: era el único
    // header fixed sin compensarlo (los dos de admin sí lo hacen), y se nota
    // sobre todo con la app instalada, donde no hay barra de navegador arriba.
    <header className="fixed top-0 z-50 w-full px-3 pt-[calc(12px+env(safe-area-inset-top))] sm:px-6 sm:pt-[calc(18px+env(safe-area-inset-top))]">
      <div className="mx-auto max-w-[1240px]">
        <div
          className="flex items-center justify-between gap-3 sm:gap-6 rounded-full px-3.5 py-2 sm:px-6 sm:py-3"
          style={{
            background: 'rgba(8,15,32,.75)',
            backdropFilter: 'blur(18px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
            border: '1px solid rgba(255,255,255,.09)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06), 0 18px 50px -28px rgba(0,0,0,.9)',
          }}
        >
          <Link
            href="/"
            aria-label="TurnoGol — inicio"
            className="shrink-0 transition-opacity hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded-full"
          >
            <Logo variant="horizontal" textClassName="text-white" />
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Rutas absolutas: el header se comparte con /precios, donde los anchors sueltos no existen. */}
            <Link
              href="/para-complejos#features"
              className="hidden items-center rounded-full px-4 py-[9px] text-sm font-semibold text-slate-300 transition-all duration-150 hover:bg-white/6 hover:text-white sm:inline-flex"
            >
              Funciones
            </Link>
            <Link
              href="/precios"
              className="hidden items-center rounded-full px-4 py-[9px] text-sm font-semibold text-slate-300 transition-all duration-150 hover:bg-white/6 hover:text-white sm:inline-flex"
            >
              Precios
            </Link>
            <Link
              href="/blog"
              className="hidden items-center rounded-full px-4 py-[9px] text-sm font-semibold text-slate-300 transition-all duration-150 hover:bg-white/6 hover:text-white sm:inline-flex"
            >
              Blog
            </Link>
            <span aria-hidden className="mx-1.5 hidden h-[22px] w-px bg-white/10 sm:inline-flex" />
            <Link
              href="/login"
              className="hidden h-11 items-center rounded-full px-5 text-sm font-semibold text-slate-200 transition-colors hover:text-white sm:inline-flex focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Ingresar
            </Link>

            <Link
              href="/register"
              className="inline-flex h-9 items-center rounded-full border border-emerald-400/60 bg-emerald-500/10 px-3.5 text-xs font-bold text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.15)] transition-[background-color,border-color,box-shadow,transform] duration-300 hover:bg-emerald-500/20 hover:border-emerald-400 hover:shadow-[0_0_24px_rgba(16,185,129,0.3)] active:scale-[0.97] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 sm:h-11 sm:px-6 sm:text-sm whitespace-nowrap"
            >
              Empezar gratis
            </Link>

            {/* Menú hamburguesa en mobile alineado al extremo derecho */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger
                aria-label="Abrir menú"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 sm:hidden"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-44 border-white/10 bg-slate-950/95 text-slate-200 backdrop-blur-xl"
              >
                <DropdownMenuItem asChild className={MOBILE_LINK_CLS}>
                  <Link href="/para-complejos#features">Funciones</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className={MOBILE_LINK_CLS}>
                  <Link href="/precios">Precios</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className={MOBILE_LINK_CLS}>
                  <Link href="/blog">Blog</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className={MOBILE_LINK_CLS}>
                  <Link href="/login">Ingresar</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  )
}
