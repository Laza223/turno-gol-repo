import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

const linkCls =
  'transition-colors hover:text-white focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 rounded'

export default function BusinessFooter() {
  return (
    <footer className="relative border-t border-white/8 py-12" style={{ background: '#020617' }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(16,185,129,.4), transparent)',
        }}
      />
      <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="flex items-center gap-2">
          <Link href="/" aria-label="TurnoGol — inicio" className={linkCls}>
            <Logo
              variant="horizontal"
              textClassName="text-white text-sm"
              iconClassName="h-7 w-7 bg-white/95"
            />
          </Link>
          {/* slate-500 (#64748b) sobre #020617 da 4.23:1, bajo AA (4.5) — no es un
              idiom dark:, es fijo, así que sube a slate-400 (7.87:1). */}
          <span className="text-xs text-slate-400">© {new Date().getFullYear()} · Argentina</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <Link href="/precios" className={linkCls}>
            Precios
          </Link>
          <Link href="/login" className={linkCls}>
            Ingresar
          </Link>
          <Link href="/register" className={linkCls}>
            Empezar gratis
          </Link>
          <a href="mailto:hola@turnogol.app" className={linkCls}>
            Contacto
          </a>
          <Link href="/privacidad" className={linkCls}>
            Privacidad
          </Link>
          <Link href="/terminos" className={linkCls}>
            Términos
          </Link>
        </div>
      </div>
    </footer>
  )
}
