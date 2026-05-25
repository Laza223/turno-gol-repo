import Link from 'next/link'

export function LegalFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-500">
      <nav className="flex justify-center gap-4">
        <Link href="/privacy" className="hover:underline hover:text-slate-900 transition-colors">
          Política de Privacidad
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms" className="hover:underline hover:text-slate-900 transition-colors">
          Términos y Condiciones
        </Link>
      </nav>
      <p className="mt-2 text-xs text-slate-400">© {new Date().getFullYear()} TurnoGol</p>
    </footer>
  )
}
