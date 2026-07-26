import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/60 py-10 dark:border-white/5 dark:bg-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Logo variant="horizontal" textClassName="text-foreground text-sm" iconClassName="h-7 w-7" />
          <span className="text-xs text-muted-foreground">© {new Date().getFullYear()} · Argentina</span>
        </div>
        {/* Los links del footer son navegación real, no texto corrido: les
            aplica el mínimo de 44px de WCAG 2.5.5 (medían 16px de alto y eran
            difíciles de acertar con el pulgar). El `gap-y-0` en mobile compensa
            la altura que suma cada link para que el bloque no crezca. */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-0 text-xs text-muted-foreground sm:gap-y-2">
          <Link href="/explorar" className="inline-flex min-h-11 items-center transition-colors hover:text-foreground sm:min-h-0">Explorar</Link>
          <Link href="/ingresar" className="inline-flex min-h-11 items-center transition-colors hover:text-foreground sm:min-h-0">Ingresar</Link>
          <a href="mailto:hola@turnogol.app" className="inline-flex min-h-11 items-center transition-colors hover:text-foreground sm:min-h-0">Contacto</a>
          <Link href="/privacidad" className="inline-flex min-h-11 items-center transition-colors hover:text-foreground sm:min-h-0">Privacidad</Link>
          <Link href="/terminos" className="inline-flex min-h-11 items-center transition-colors hover:text-foreground sm:min-h-0">Términos</Link>
        </div>
      </div>
    </footer>
  )
}
