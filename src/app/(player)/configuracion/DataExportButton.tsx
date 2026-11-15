'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { rejectionMessage } from '@/shared/lib/rejection-message'

const EXPORT_ERROR_FALLBACK = 'No se pudo generar la exportación. Intentá de nuevo en unos minutos.'

export function DataExportButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)

  async function handleDownload() {
    setStatus('loading')
    setError(null)

    try {
      const res = await fetch('/api/player/data-export', { credentials: 'include' })

      if (!res.ok) {
        setStatus('error')
        setError(await rejectionMessage(res, EXPORT_ERROR_FALLBACK))
        return
      }

      const parsed = (await res.json()) as { data?: unknown }
      const bundle = parsed?.data

      // #18: un 200 con JSON sin el campo `data` dejaba bundle=undefined y
      // JSON.stringify(undefined) produce un Blob con la cadena literal
      // "undefined". Validar la forma antes de descargar.
      if (bundle === undefined || bundle === null) {
        setStatus('error')
        setError(EXPORT_ERROR_FALLBACK)
        return
      }

      const name = `turnogol-mis-datos-${new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
      })}.json`

      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = name
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)

      setFilename(name)
      setStatus('done')
    } catch {
      setStatus('error')
      setError(EXPORT_ERROR_FALLBACK)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="pill-link"
        size="pill-sm"
        onClick={handleDownload}
        disabled={status === 'loading'}
        className="disabled:opacity-100 disabled:text-portal-soft"
      >
        <Download aria-hidden />
        {status === 'loading' ? 'Generando…' : 'Descargar mis datos'}
      </Button>
      {/* Región viva siempre montada: "Generando…" y "Listo" se anuncian sin mover el foco. */}
      <p aria-live="polite" role="status" className="text-sm text-portal-soft">
        {status === 'loading' && 'Estamos armando tu archivo.'}
        {status === 'done' && `Listo, se descargó ${filename}.`}
      </p>
      {status === 'error' && error && (
        <p role="alert" className="text-[13px] leading-5 text-portal-bad">
          {error}
        </p>
      )}
    </div>
  )
}
