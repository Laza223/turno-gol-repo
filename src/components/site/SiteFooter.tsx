import Link from 'next/link'

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-slate-950 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-xs font-bold text-slate-950">TG</span>
          <span className="text-sm font-semibold text-white">TurnoGol</span>
          <span className="text-xs text-slate-500">© {new Date().getFullYear()} · Argentina</span>
        </div>
        <div className="flex gap-6 text-xs text-slate-400">
          <Link href="/explorar" className="hover:text-white transition-colors">Explorar</Link>
          <Link href="/login" className="hover:text-white transition-colors">Iniciar sesión</Link>
          <a href="mailto:hola@turnogol.com.ar" className="hover:text-white transition-colors">Contacto</a>
        </div>
      </div>
    </footer>
  )
}
