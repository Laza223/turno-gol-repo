import type { EmailContent } from './index'

export type DailySummaryData = {
  /** "lun 1 de agosto" — formato medio §8.3, ya resuelto por el caller. */
  dateLabel: string
  /** Pre-formatted ARS, ej. "184.500,00". */
  collectedArs: string
  /** "11/12". */
  occupiedLabel: string
  cashClosed: boolean
}

/**
 * D8 (Fase 2 — docs/planning/2026-08-01-decisiones-de-fase-v2.md §3):
 * resumen diario del día anterior, opt-in (no default). Sin nombre de tenant
 * ni de dueño interpolado en el cuerpo a propósito — son campos de texto
 * libre controlados por el negocio y este template solo maneja datos
 * numéricos/booleanos, evitando la superficie de HTML injection de raíz.
 */
export function renderDailySummary(data: DailySummaryData): EmailContent {
  const cajaLabel = data.cashClosed ? 'caja cerrada' : 'caja sin cerrar todavía'
  const summaryLine = `${data.dateLabel}: $${data.collectedArs} · ${data.occupiedLabel} · ${cajaLabel}`
  const subject = `Resumen de ayer — $${data.collectedArs}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#059669">Resumen de ayer</h2>
  <p style="font-size:18px;font-weight:600">${summaryLine}</p>
  <p style="color:#64748b;font-size:14px">Activaste este resumen en Configuración → Avisos. Podés desactivarlo cuando quieras.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`
  const text = `Resumen de ayer\n\n${summaryLine}\n\nActivaste este resumen en Configuración → Avisos.\n\n— TurnoGol`
  return { subject, html, text }
}
