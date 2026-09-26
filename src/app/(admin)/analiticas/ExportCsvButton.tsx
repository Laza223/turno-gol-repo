'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type ExportCsvButtonProps = {
  from: string
  to: string
  className?: string
}

export function ExportCsvButton({ from, to, className }: ExportCsvButtonProps) {
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
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      isLoading={downloading}
      className={cn('gap-1.5', className)}
    >
      {!downloading && <Download className="h-4 w-4" aria-hidden="true" />}
      Exportar CSV
    </Button>
  )
}
