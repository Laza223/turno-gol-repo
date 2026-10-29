import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { ContactChannels } from './ContactChannels'
import { IngresarLink } from './IngresarLink'

// Mismo mínimo de 44px del resto de la fila, pero cuadrado: son íconos, así que
// el ancho no lo da el texto.
const channelCls =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded transition-colors hover:text-foreground'

/**
 * `signedIn` solo lo pasa quien YA sabe que hay sesión (el layout del jugador la siembra desde el
 * server): ahí "Ingresar" sobra. En las rutas públicas la sesión hidrata después, así que no se
 * decide por contexto —el link parpadearía— y el footer queda como siempre.
 */
export default function SiteFooter({ signedIn = false }: { signedIn?: boolean } = {}) {
  return (
    <footer className="border-t border-border bg-card/60 py-10 dark:border-white/5 dark:bg-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Logo
            variant="horizontal"
            textClassName="text-foreground text-sm"
            iconClassName="h-7 w-7"
          />
          <span className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} · Argentina
          </span>
        </div>
        {/* Los links del footer son navegación real, no texto corrido: les
            aplica el mínimo de 44px de WCAG 2.5.5 (medían 16px de alto y eran
            difíciles de acertar con el pulgar). El `gap-y-0` en mobile compensa
            la altura que suma cada link para que el bloque no crezca. */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-0 text-xs text-muted-foreground">
          <Link
            href="/explorar"
            className="inline-flex min-h-11 items-center transition-colors hover:text-foreground"
          >
            Explorar
          </Link>
          {!signedIn && (
            <IngresarLink className="inline-flex min-h-11 items-center transition-colors hover:text-foreground">
              Ingresar
            </IngresarLink>
          )}
          <Link
            href="/para-complejos"
            className="inline-flex min-h-11 items-center transition-colors hover:text-foreground"
          >
            Para complejos
          </Link>
          <Link
            href="/privacidad"
            className="inline-flex min-h-11 items-center transition-colors hover:text-foreground"
          >
            Privacidad
          </Link>
          <Link
            href="/terminos"
            className="inline-flex min-h-11 items-center transition-colors hover:text-foreground"
          >
            Términos
          </Link>
          <ContactChannels linkClassName={channelCls} />
        </div>
      </div>
    </footer>
  )
}
