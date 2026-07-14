import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">Complejo no encontrado</h1>
        <p className="text-sm text-muted-foreground">
          No encontramos este complejo. ¿Buscás otro?
        </p>
        <Link
          href="/"
          // emerald-700 (#047857) sobre `bg-background` (#e2e7ee, no blanco puro)
          // da 4.41:1 — bajo AA (4.5). emerald-800 (#065f46) da 6.19:1.
          className="inline-flex items-center text-sm font-medium text-emerald-800 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-200 transition-colors duration-150"
        >
          ← Volver al inicio
        </Link>
      </div>
    </div>
  )
}
