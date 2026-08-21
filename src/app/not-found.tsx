import Link from 'next/link'
import { Home, Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12 text-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/20">
        <Compass className="h-7 w-7 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      </div>
      <p className="text-7xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums sm:text-8xl">
        404
      </p>
      <h1 className="mt-4 text-2xl font-semibold text-foreground">Página no encontrada</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        La página que buscás no existe o fue movida. Verificá la dirección o volvé al inicio.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,scale] hover:bg-emerald-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <Home className="h-4 w-4" aria-hidden="true" />
        Volver al inicio
      </Link>
    </main>
  )
}
