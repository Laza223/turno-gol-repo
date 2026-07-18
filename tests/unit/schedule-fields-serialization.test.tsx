// @vitest-environment happy-dom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  deriveScheduleView,
  type ScheduleView,
} from '@/app/(admin)/settings/horarios/horarios-lib'
import { openingHours } from '@/test/fixtures/tenant'
import { ScheduleFields } from '@/components/schedule/ScheduleFields'

/**
 * Regresión del bug de clase "Collapsible desmonta inputs" (Fase 3 UX):
 * Radix CollapsibleContent SIN forceMount desmonta sus children al colapsar,
 * y todo input con name= desaparece del FormData — un admin que abría el
 * panel, tildaba "Cierra después de medianoche" y lo volvía a colapsar antes
 * de guardar PERDÍA la config en silencio (el schema lee
 * formData.get('closes_next_day') === 'on' y recibía null). El wrapper
 * ui/collapsible.tsx ahora usa forceMount + display:none, y este test cubre
 * exactamente ese camino: abrir → tildar → colapsar → submit.
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
  const [closesNextDay, setClosesNextDay] = useState(false)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onData(new FormData(e.currentTarget))
      }}
    >
      <ScheduleFields
        view={view}
        onViewChange={setView}
        closesNextDay={closesNextDay}
        onClosesNextDayChange={setClosesNextDay}
      />
      <button type="submit">Guardar horarios</button>
    </form>
  )
}

afterEach(() => cleanup())

describe('ScheduleFields — serialización con el panel colapsado', () => {
  it('closes_next_day tildado sobrevive a re-colapsar el panel antes del submit', () => {
    const onData = vi.fn()
    render(<Harness onData={onData} />)

    const trigger = screen.getByRole('button', { name: 'Excepciones y detalles avanzados' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(trigger)
    fireEvent.click(screen.getByLabelText(/^Cierra después de medianoche/))
    // Re-colapsar ANTES de guardar: acá moría el dato sin forceMount.
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar horarios' }))

    expect(onData).toHaveBeenCalledOnce()
    const fd = onData.mock.calls[0]![0] as FormData
    expect(fd.get('closes_next_day')).toBe('on')
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
    // Sin tildar, el checkbox colapsado no aporta el flag (default correcto).
    expect(fd.get('closes_next_day')).toBeNull()
  })
})
