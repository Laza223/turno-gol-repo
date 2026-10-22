import { describe, expect, it } from 'vitest'
import { renderTemplate } from '@/modules/notifications/templates'
import type { WeeklySummaryData } from '@/modules/notifications/templates/weekly-summary'

/**
 * El semanal no tiene template propio: viaja como `daily_summary` con
 * `kind: 'weekly'` (el registro de templates lo comparte RIVAL). Se prueba por
 * `renderTemplate`, que es el camino real de `send-email.worker.ts`.
 */
const WEEKLY: WeeklySummaryData = {
  kind: 'weekly',
  weekLabel: 'lun 12 al dom 18 de octubre',
  totalArs: '$ 1.234.000',
  comparison: { direction: 'up', label: '12% vs la semana anterior', prevArs: '$ 1.100.000' },
  methods: [
    { label: 'Efectivo', amountArs: '$ 700.000' },
    { label: 'MercadoPago', amountArs: '$ 134.000' },
    { label: 'Transferencia', amountArs: '$ 400.000' },
  ],
}

describe('resumen semanal por el template daily_summary', () => {
  it('sale con su propio asunto, no con el del diario', () => {
    const { subject } = renderTemplate('daily_summary', WEEKLY)
    expect(subject).toBe('Tu semana: entraron $ 1.234.000')
  })

  it('el html trae la semana, el total, la comparación y cada método', () => {
    const { html } = renderTemplate('daily_summary', WEEKLY)
    expect(html).toContain('lun 12 al dom 18 de octubre')
    expect(html).toContain('Entraron $ 1.234.000')
    expect(html).toContain('↑ 12% vs la semana anterior ($ 1.100.000)')
    for (const m of WEEKLY.methods) {
      expect(html).toContain(m.label)
      expect(html).toContain(m.amountArs)
    }
    expect(html).toContain('/analiticas')
    expect(html).not.toContain('Resumen de ayer')
  })

  it('una semana peor lleva la flecha para abajo', () => {
    const { html } = renderTemplate('daily_summary', {
      ...WEEKLY,
      comparison: { direction: 'down', label: '20% vs la semana anterior', prevArs: '$ 1.100.000' },
    })
    expect(html).toContain('↓ 20% vs la semana anterior')
  })

  it('sin semana anterior no inventa una comparación', () => {
    const { html, text } = renderTemplate('daily_summary', { ...WEEKLY, comparison: null })
    expect(html).not.toContain('vs la semana anterior')
    expect(text).not.toContain('vs la semana anterior')
  })

  it('el texto plano lleva lo mismo que el html', () => {
    const { text } = renderTemplate('daily_summary', WEEKLY)
    expect(text).toContain('Entraron $ 1.234.000')
    expect(text).toContain('↑ 12% vs la semana anterior ($ 1.100.000)')
    expect(text).toContain('Efectivo: $ 700.000')
  })

  it('el contenido del diario (sin `kind`) sigue saliendo como diario', () => {
    const { subject, html } = renderTemplate('daily_summary', {
      dateLabel: 'dom 18 de octubre',
      collectedArs: '184.500',
      occupiedLabel: '11/12',
    })
    expect(subject).toBe('Resumen de ayer — $184.500')
    expect(html).toContain('dom 18 de octubre: $184.500 · 11/12')
  })
})
