'use client'

import { FileDown } from 'lucide-react'
import { PORTAL_LINK } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'

/**
 * Dispara window.print(): por las reglas de #booking-receipt en globals.css
 * solo se imprime el comprobante, y "Guardar como PDF" del navegador genera
 * el archivo client-side (sin puppeteer ni servicios externos). El título del
 * documento se reemplaza durante la impresión para sugerir un nombre de
 * archivo útil.
 */
export default function DownloadReceiptButton({ fileName }: { fileName: string }) {
  function handlePrint() {
    const prev = document.title
    document.title = fileName
    try {
      window.print()
    } finally {
      document.title = prev
    }
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={cn(
        PORTAL_LINK,
        'mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700 underline underline-offset-4 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300',
      )}
    >
      <FileDown className="size-4" aria-hidden />
      Descargar comprobante
    </button>
  )
}
