import { describe, expect, it } from 'vitest'
import { depositAfterCloseNote } from '@/components/booking/deposit-after-close'

// 🔴 QA 2026-08-28 F-02. La plata ya no se pierde (entra como ajuste), pero el
// encargado que la cobró tiene que enterarse en el momento: si va a buscarla al
// resumen del día no la ve entre los ingresos.
describe('depositAfterCloseNote', () => {
  const base = 'Cancha 1 · 20:00–21:00'

  it('con la caja abierta el toast queda igual que siempre', () => {
    expect(depositAfterCloseNote(base, false)).toBe(base)
  })

  it('con la caja cerrada avisa que la seña quedó como ajuste', () => {
    const note = depositAfterCloseNote(base, true)
    expect(note).toContain(base)
    expect(note).toContain('caja de hoy ya estaba cerrada')
    expect(note).toContain('ajuste')
  })
})
