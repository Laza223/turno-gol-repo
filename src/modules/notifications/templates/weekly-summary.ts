import type { EmailContent } from './index'
import { appLink } from './app-link'

export type WeeklySummaryData = {
  /** Distingue este contenido del diario: viajan por el mismo template. */
  kind: 'weekly'
  /** "lun 12 al dom 18 de octubre" — ya resuelto por el caller. */
  weekLabel: string
  /** Pre-formatted ARS, ej. "$ 1.234.000". */
  totalArs: string
  /** `null` cuando la semana anterior no tuvo ingresos: no hay contra qué comparar. */
  comparison: { direction: 'up' | 'down'; label: string; prevArs: string } | null
  /** Efectivo, MercadoPago y transferencia siempre; "Otro" solo si hubo. */
  methods: Array<{ label: string; amountArs: string }>
}

/**
 * Resumen semanal por mail (opt-in, solo administradores): lo que entró en la
 * semana operativa lun–dom, por dónde y contra la anterior. Lo arma
 * `buildWeeklySummary` (modules/reports/weekly-summary.ts). Igual que el
 * diario, sin nombre de complejo ni de personas: solo montos y rótulos fijos.
 */
export function renderWeeklySummary(data: WeeklySummaryData): EmailContent {
  const comparisonLine = data.comparison
    ? `${data.comparison.direction === 'up' ? '↑' : '↓'} ${data.comparison.label} (${data.comparison.prevArs})`
    : null
  const metricsUrl = appLink('/analiticas')
  const subject = `Tu semana: entraron ${data.totalArs}`

  const methodRows = data.methods
    .map(
      (m) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${m.label}</td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums">${m.amountArs}</td></tr>`,
    )
    .join('')

  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#059669;margin-bottom:4px">Tu semana</h2>
  <p style="color:#64748b;font-size:14px;margin-top:0">${data.weekLabel}</p>
  <p style="font-size:24px;font-weight:600;margin-bottom:4px">Entraron ${data.totalArs}</p>
  ${comparisonLine ? `<p style="color:#64748b;font-size:14px;margin-top:0">${comparisonLine}</p>` : ''}
  <h3 style="font-size:16px;margin-top:24px">Por dónde entró</h3>
  <table style="width:100%;border-collapse:collapse;font-size:15px">${methodRows}</table>
  <p style="margin-top:24px"><a href="${metricsUrl}" style="color:#059669;font-weight:600">Ver el detalle en Métricas</a></p>
  <p style="color:#64748b;font-size:14px">Está activado en Ajustes → Vos y tu equipo. Lo podés apagar cuando quieras.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`

  const text = [
    `Tu semana — ${data.weekLabel}`,
    '',
    `Entraron ${data.totalArs}`,
    ...(comparisonLine ? [comparisonLine] : []),
    '',
    'Por dónde entró',
    ...data.methods.map((m) => `${m.label}: ${m.amountArs}`),
    '',
    `Ver el detalle en Métricas: ${metricsUrl}`,
    '',
    'Está activado en Ajustes → Vos y tu equipo.',
    '',
    '— TurnoGol',
  ].join('\n')

  return { subject, html, text }
}
