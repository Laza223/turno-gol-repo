'use client'

import { useState } from 'react'

export function DataExportButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setStatus('loading')
    setError(null)

    try {
      const res = await fetch('/api/player/data-export', { credentials: 'include' })

      if (!res.ok) {
        setStatus('error')
        setError('No se pudo generar la exportación. Intentá de nuevo en unos minutos.')
        return
      }

      const parsed = (await res.json()) as { data?: unknown }
      const bundle = parsed?.data

      // #18: un 200 con JSON sin el campo `data` dejaba bundle=undefined y
      // JSON.stringify(undefined) produce un Blob con la cadena literal
      // "undefined". Validar la forma antes de descargar.
      if (bundle === undefined || bundle === null) {
        setStatus('error')
        setError('No se pudo generar la exportación. Intentá de nuevo en unos minutos.')
        return
      }

      const filename = `turnogol-mis-datos-${new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
      })}.json`

      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)

      setStatus('idle')
    } catch {
      setStatus('error')
      setError('No se pudo generar la exportación. Intentá de nuevo en unos minutos.')
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={status === 'loading'}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-lg hover:shadow-emerald-600/30 active:scale-[0.98] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:hover:translate-y-0 dark:shadow-emerald-500/25"
      >
        {status === 'loading' ? 'Generando...' : 'Descargar mis datos'}
      </button>
      {status === 'error' && error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}
