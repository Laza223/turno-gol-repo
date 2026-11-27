import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { ContactChannels } from './ContactChannels'

// Navegación real, no texto corrido: 44 px de alto (WCAG 2.5.5), como en `SiteFooter`.
const linkCls =
  'inline-flex min-h-11 items-center rounded-sm text-portal-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green'

// Los canales son íconos: mismo mínimo táctil, pero cuadrado.
const channelCls =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-portal-soft transition-colors hover:text-portal-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green'

/**
 * Pie de las páginas para complejos. Portal de vidrio (F8): el look de `SiteFooter` (la palabra
 * gigante, sin fondo propio, sobre la luz de fondo de la página) con los links del dueño de
 * siempre: Precios, Ingresar → /login, Empezar gratis → /register, legales y canales.
 */
export default function BusinessFooter() {
  return (
    <footer className="pb-10 font-display">
      <div className="mx-auto w-[min(1120px,calc(100%-40px))] md:w-[min(1120px,calc(100%-48px))] lg:w-[min(1120px,calc(100%-96px))]">
        <p aria-hidden className="portal-word">
          Turno<span className="text-portal-green">Gol</span>
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            aria-label="TurnoGol, inicio"
            className={`${linkCls} self-start hover:no-underline sm:self-auto`}
          >
            <Logo variant="horizontal" />
          </Link>
          <div className="flex flex-wrap gap-x-6 text-base">
            <Link href="/precios" className={linkCls}>
              Precios
            </Link>
            <Link href="/login" className={linkCls}>
              Ingresar
            </Link>
            <Link href="/register" className={linkCls}>
              Probar 30 días gratis
            </Link>
            <Link href="/privacidad" className={linkCls}>
              Privacidad
            </Link>
            <Link href="/terminos" className={linkCls}>
              Términos
            </Link>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-portal-inner-line pt-5 text-sm text-portal-soft">
          <span>© {new Date().getFullYear()} · Argentina</span>
          <ContactChannels linkClassName={channelCls} />
        </div>
      </div>
    </footer>
  )
}
