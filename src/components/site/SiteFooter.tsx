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
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <Link href="/explorar" className="transition-colors hover:text-foreground">Explorar</Link>
          <Link href="/ingresar" className="transition-colors hover:text-foreground">Ingresar</Link>
          <a href="mailto:hola@turnogol.app" className="transition-colors hover:text-foreground">Contacto</a>
          <Link href="/privacidad" className="transition-colors hover:text-foreground">Privacidad</Link>
          <Link href="/terminos" className="transition-colors hover:text-foreground">Términos</Link>
        </div>
      </div>
    </footer>
  )
}
