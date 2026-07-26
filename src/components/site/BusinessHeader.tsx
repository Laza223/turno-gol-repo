import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

/**
 * Cabecera B2B (para-complejos) — pill flotante dark-premium, mismo lenguaje
 * visual que el header overlay del jugador, pero con links de staff:
 * Ingresar → /login (password), Empezar gratis → /register. Sin nav de jugador.
 */
export default function BusinessHeader() {
  return (
    // pt combina el respiro visual con el safe-area del notch: era el único
    // header fixed sin compensarlo (los dos de admin sí lo hacen), y se nota
    // sobre todo con la app instalada, donde no hay barra de navegador arriba.
    <header className="fixed top-0 z-50 w-full px-6 pt-[calc(18px+env(safe-area-inset-top))]">
      <div className="mx-auto max-w-[1240px]">
        <div
          className="flex items-center justify-between gap-6"
          style={{
            padding: '12px 14px 12px 24px',
            borderRadius: '9999px',
            background: 'rgba(8,15,32,.62)',
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
          <div className="flex items-center gap-1.5">
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
              className="inline-flex h-10 items-center rounded-full border border-emerald-400/60 bg-emerald-500/5 px-3.5 text-xs font-bold text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.15)] transition-all duration-300 hover:bg-emerald-500/15 hover:border-emerald-400 hover:shadow-[0_0_24px_rgba(16,185,129,0.3)] active:scale-[0.97] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 sm:h-11 sm:px-6 sm:text-sm whitespace-nowrap"
            >
              Empezar gratis
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
