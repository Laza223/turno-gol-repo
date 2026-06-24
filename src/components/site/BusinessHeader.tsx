import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

/**
 * Cabecera de la superficie B2B (para-complejos). Dark, propia del producto:
 * sin navegación de jugador ni bottom-nav. Logo → home; anclas a secciones de
 * la landing; CTAs unificados Ingresar (/login) + Empezar gratis (/register).
 */
export default function BusinessHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="TurnoGol — inicio" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded">
          <Logo variant="horizontal" textClassName="text-white" iconClassName="bg-white/95 border-emerald-500 shadow-emerald-500/30" />
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-slate-300 transition-colors hover:text-white">
            Funciones
          </a>
          <a href="#testimonios" className="text-sm text-slate-300 transition-colors hover:text-white">
            Testimonios
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-medium text-slate-200 transition-colors hover:text-white sm:inline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded"
          >
            Ingresar
          </Link>
          <Link
            href="/register"
            className="inline-flex h-11 items-center rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Empezar gratis
          </Link>
        </div>
      </div>
    </header>
  )
}
