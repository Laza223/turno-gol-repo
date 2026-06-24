import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

export default function BusinessFooter() {
  return (
    <footer className="border-t border-white/5 bg-slate-950 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Logo variant="horizontal" textClassName="text-white text-sm" iconClassName="h-7 w-7 bg-white/95" />
          <span className="text-xs text-slate-500">© {new Date().getFullYear()} · Argentina</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <Link href="/login" className="transition-colors hover:text-white">Ingresar</Link>
          <Link href="/register" className="transition-colors hover:text-white">Empezar gratis</Link>
          <a href="mailto:hola@turnogol.app" className="transition-colors hover:text-white">Contacto</a>
          <Link href="/privacy" className="transition-colors hover:text-white">Privacidad</Link>
          <Link href="/terms" className="transition-colors hover:text-white">Términos</Link>
        </div>
      </div>
    </footer>
  )
}
