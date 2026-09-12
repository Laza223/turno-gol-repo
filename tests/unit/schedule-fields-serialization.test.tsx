// @vitest-environment happy-dom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { deriveScheduleView, type ScheduleView } from '@/lib/schedule/schedule-view'
import { openingHours } from '@/test/fixtures/tenant'
import { ScheduleFields } from '@/components/schedule/ScheduleFields'

/**
 * Regresión del bug de clase "Collapsible desmonta inputs" (Fase 3 UX):
 * Radix CollapsibleContent SIN forceMount desmonta sus children al colapsar,
 * y todo input con name= desaparece del FormData — un admin que abría el
 * panel, personalizaba un día y lo volvía a colapsar antes de guardar PERDÍA
 * la config en silencio. El wrapper ui/collapsible.tsx ahora usa forceMount +
 * display:none, y este test cubre exactamente ese camino: abrir → personalizar
 * un día → colapsar → submit.
 *
 * El checkbox manual "Cierra después de medianoche" que este archivo testeaba
 * se sacó de `ScheduleFields` (rediseño de Configuración, 2026-09):
 * `closesNextDay` se deriva siempre de los pares open/close, sin campo del
 * form — ver `tests/unit/opening-hours-validation.test.ts` para la cobertura
 * de esa derivación.
 */

/** Vista sin config avanzada: los 7 días heredan el general → panel arranca colapsado. */
function virginView(): ScheduleView {
  const v = deriveScheduleView(openingHours())
  for (const day of Object.keys(v.days) as (keyof ScheduleView['days'])[]) {
    v.days[day] = { mode: 'general', open: v.general.open, close: v.general.close }
  }
  return v
}

function Harness({ onData }: { onData: (fd: FormData) => void }) {
  const [view, setView] = useState(virginView)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onData(new FormData(e.currentTarget))
      }}
    >
      <ScheduleFields view={view} onViewChange={setView} />
      <button type="submit">Guardar horarios</button>
    </form>
  )
}

afterEach(() => cleanup())

describe('ScheduleFields — serialización con el panel colapsado', () => {
  it('un día personalizado sobrevive a re-colapsar el panel antes del submit', () => {
    const onData = vi.fn()
    render(<Harness onData={onData} />)

    const trigger = screen.getByRole('button', { name: /Excepciones por día/i })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(trigger)
    const saturdayItem = screen.getByText('Sábado').closest('li')!
    fireEvent.click(within(saturdayItem).getByRole('button', { name: 'Personalizar' }))
    fireEvent.change(screen.getByLabelText('Sábado: cierra'), { target: { value: '02:00' } })
    // Re-colapsar ANTES de guardar: acá moría el dato sin forceMount.
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar horarios' }))

    expect(onData).toHaveBeenCalledOnce()
    const fd = onData.mock.calls[0]![0] as FormData
    expect(fd.get('sat_close')).toBe('02:00')
  })

  it('los 7 días serializan sin abrir nunca el panel (hidden inputs fuera del Collapsible)', () => {
    const onData = vi.fn()
    render(<Harness onData={onData} />)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar horarios' }))

    const fd = onData.mock.calls[0]![0] as FormData
    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
      expect(fd.get(`${day}_open`), `${day}_open ausente`).toBeTruthy()
      expect(fd.get(`${day}_close`), `${day}_close ausente`).toBeTruthy()
    }
  })
})
