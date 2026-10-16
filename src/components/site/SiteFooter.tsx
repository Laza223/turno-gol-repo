import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { ContactChannels } from './ContactChannels'
import { IngresarLink } from './IngresarLink'

// Pie plano de La Reserva: mismo fondo que la barra (card en claro, background en oscuro)
// y solo tokens semánticos, así se ve igual con los del panel y con los del mundo del
// portal. Todo link mide 44px de alto en todos los anchos (WCAG 2.5.5): no son texto
// corrido, son navegación (a 16px de alto eran difíciles de acertar con el pulgar).
const focusCls =
  'rounded-md transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card dark:focus-visible:ring-offset-background'
const linkCls = `inline-flex min-h-11 items-center whitespace-nowrap ${focusCls}`
// Los canales son íconos: el ancho no lo da el texto, así que también son cuadrados de 44px.
const channelCls = `inline-flex min-h-11 min-w-11 items-center justify-center ${focusCls}`

export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card dark:bg-background">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Logo
            variant="horizontal"
            textClassName="text-foreground text-sm"
            iconClassName="h-7 w-7"
          />
          <span className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} · Argentina
          </span>
        </div>
        {/* Debajo de sm el corte es deliberado: links en una fila y canales en otra, así "Términos"
            no queda huérfano junto a los íconos. */}
        <div className="flex flex-col items-center text-sm text-muted-foreground sm:flex-row sm:gap-x-6">
          <div className="flex items-center gap-x-4 sm:gap-x-6">
            <Link href="/explorar" className={linkCls}>
              Explorar
            </Link>
            <IngresarLink className={linkCls}>Ingresar</IngresarLink>
            <Link href="/privacidad" className={linkCls}>
              Privacidad
            </Link>
            <Link href="/terminos" className={linkCls}>
              Términos
            </Link>
          </div>
          <ContactChannels linkClassName={channelCls} />
        </div>
      </div>
    </footer>
  )
}
