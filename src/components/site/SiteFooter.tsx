import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { contactWhatsappUrl } from '@/lib/contact'
import { ContactChannels } from './ContactChannels'
import { FooterRivalLink } from './FooterRivalLink'

// Navegación real, no texto corrido: 44 px de alto (WCAG 2.5.5).
const linkCls =
  'inline-flex min-h-11 min-w-11 items-center rounded-sm text-portal-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green'
const headCls = 'mb-1 text-sm font-semibold text-portal-soft'
// Los canales son íconos: mismo mínimo táctil, pero cuadrado.
const channelCls =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-portal-soft transition-colors hover:text-portal-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green'

/**
 * Pie del portal de vidrio (decisión 2026-11-13; los textos del mockup, elegidos por Lazar el
 * 2026-11-13): la palabra gigante, la marca con su frase y tres columnas. "Tablón de Rival"
 * aparece solo con el flag. Va sin fondo propio, sobre la luz de fondo de la página.
 * El "Ingresar" del pie anterior salió: lo cubren la cabecera y la barra de abajo.
 */
export default function SiteFooter() {
  return (
    <footer className="pb-10 font-display">
      <div className="mx-auto w-[min(1120px,calc(100%-40px))] md:w-[min(1120px,calc(100%-48px))] lg:w-[min(1120px,calc(100%-96px))]">
        <p aria-hidden className="portal-word">
          Turno<span className="text-portal-green">Gol</span>
        </p>
        <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="col-span-2 grid gap-3 sm:col-span-3 md:col-span-1">
            <Link
              href="/"
              aria-label="TurnoGol — inicio"
              className={`${linkCls} justify-self-start hover:no-underline`}
            >
              <Logo variant="horizontal" />
            </Link>
            <p className="max-w-[34ch] text-base text-portal-soft">
              Turnos de fútbol para reservar online, en los complejos de tu zona.
            </p>
          </div>
          <div>
            <h2 className={headCls}>Jugadores</h2>
            <ul>
              <li>
                <Link href="/explorar" className={linkCls}>
                  Buscar canchas
                </Link>
              </li>
              <FooterRivalLink className={linkCls} />
            </ul>
          </div>
          <div>
            <h2 className={headCls}>Complejos</h2>
            <ul>
              <li>
                <Link href="/para-complejos" className={linkCls}>
                  TurnoGol para complejos
                </Link>
              </li>
              <li>
                <Link href="/precios" className={linkCls}>
                  Precios
                </Link>
              </li>
              <li>
                <Link href="/blog" className={linkCls}>
                  Blog
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className={headCls}>Ayuda</h2>
            <ul>
              <li>
                <Link href="/terminos" className={linkCls}>
                  Términos
                </Link>
              </li>
              <li>
                <Link href="/privacidad" className={linkCls}>
                  Privacidad
                </Link>
              </li>
              <li>
                <a
                  href={contactWhatsappUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkCls}
                >
                  Escribinos
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-portal-inner-line pt-5 text-sm text-portal-soft">
          <span>© {new Date().getFullYear()} TurnoGol</span>
          <ContactChannels linkClassName={channelCls} />
        </div>
      </div>
    </footer>
  )
}
