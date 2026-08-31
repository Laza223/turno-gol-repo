'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

type ExportCsvButtonProps = {
  from: string
  to: string
}

export function ExportCsvButton({ from, to }: ExportCsvButtonProps) {
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/reports/revenue?from=${from}&to=${to}&format=csv`)
      if (!res.ok) {
        let message = 'No se pudo descargar el reporte.'
        try {
          const data = (await res.json()) as { error?: { message?: string } }
          if (data.error?.message) {
            message = data.error.message
          }
        } catch {
          // Si no vino JSON, usar mensaje genérico
        }
        toast({
          title: 'Error al exportar',
          description: message,
          variant: 'destructive',
        })
        return
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = `reporte-${from}-${to}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch {
      toast({
        title: 'Error al exportar',
        description: 'Hubo un error de conexión al descargar el archivo.',
        variant: 'destructive',
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-xs hover:bg-accent disabled:opacity-50"
    >
      {downloading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
      Exportar CSV
    </button>
  )
}
