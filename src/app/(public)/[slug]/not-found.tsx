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
          className="inline-flex items-center text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors duration-150"
        >
          ← Volver al inicio
        </Link>
      </div>
    </div>
  )
}
