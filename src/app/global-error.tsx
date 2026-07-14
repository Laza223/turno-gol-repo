'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'

/**
 * Global error boundary. Replaces the root layout when an error is thrown in
 * the layout itself (the one place `app/error.tsx` cannot catch). Must render
 * its own <html>/<body>. Reports to Sentry per Next.js + Sentry guidance.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="es">
      <body>
        <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12 font-sans">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-lg">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 ring-1 ring-inset ring-red-600/20">
              <AlertTriangle className="h-7 w-7 text-red-600" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Algo salió mal
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Ocurrió un error y no pudimos cargar la aplicación. Ya quedó
              registrado. Probá recargar la página.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-emerald-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reintentar
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
