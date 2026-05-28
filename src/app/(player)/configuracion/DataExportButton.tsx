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

      const data = (await res.json()) as { data: unknown }
      const bundle = data.data

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
        className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors active:scale-[0.98]"
      >
        {status === 'loading' ? 'Generando...' : 'Descargar mis datos'}
      </button>
      {status === 'error' && error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
