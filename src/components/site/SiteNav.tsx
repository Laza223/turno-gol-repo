import Link from 'next/link'

type Props = { variant?: 'overlay' | 'solid' }

export default function SiteNav({ variant = 'solid' }: Props) {
  if (variant === 'overlay') {
    return (
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 text-white">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/90 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/30">
              TG
            </span>
            <span className="text-lg font-semibold tracking-tight">TurnoGol</span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <Link href="/explorar" className="text-sm text-slate-300 hover:text-white transition-colors">Explorar</Link>
            <Link href="/para-complejos" className="text-sm text-slate-300 hover:text-white transition-colors">Para complejos</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-sm font-medium text-slate-200 hover:text-white transition-colors sm:inline">
              Iniciar sesión
            </Link>
            <Link href="/register" className="inline-flex h-9 items-center rounded-md bg-white px-4 text-sm font-semibold text-slate-900 shadow-lg shadow-slate-900/30 hover:bg-slate-100 transition-colors duration-150">
              Comenzar
            </Link>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-slate-900">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-sm font-bold text-white shadow-sm">TG</span>
          <span className="text-lg font-semibold tracking-tight">TurnoGol</span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/explorar" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Explorar</Link>
          <Link href="/para-complejos" className="hidden text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors sm:inline">Para complejos</Link>
          <Link href="/login" className="inline-flex h-9 items-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors">
            Ingresar
          </Link>
        </nav>
      </div>
    </header>
  )
}
