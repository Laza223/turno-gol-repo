'use client'

import { FileDown } from 'lucide-react'

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
      className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
    >
      <FileDown className="h-4 w-4" aria-hidden />
      Descargar comprobante
    </button>
  )
}
