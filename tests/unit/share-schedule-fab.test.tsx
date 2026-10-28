// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

// El diálogo real trae su propio render de la placa: acá solo importa que se abra.
vi.mock('next/dynamic', () => ({
  default: () => (props: { onClose: () => void }) => (
    <div role="dialog" aria-label="Placa">
      <button onClick={props.onClose}>cerrar placa</button>
    </div>
  ),
}))

import { ShareScheduleFab } from '@/app/(admin)/dashboard/_components/ShareScheduleFab'

const KEY = 'tg:share-schedule-fab-closed:m10'

function renderFab(operatingDate = '2026-10-26') {
  return render(
    <ShareScheduleFab
      slug="m10"
      bookingAdvanceDays={6}
      trackAction={vi.fn()}
      operatingDate={operatingDate}
    />,
  )
}

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ShareScheduleFab', () => {
  it('se muestra y abre la placa', () => {
    renderFab()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /compartir horarios/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'cerrar placa' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('la X lo oculta y guarda el día operativo', () => {
    renderFab()
    fireEvent.click(screen.getByRole('button', { name: /cerrar hasta mañana/i }))
    expect(screen.queryByRole('button', { name: /compartir horarios/i })).toBeNull()
    expect(window.localStorage.getItem(KEY)).toBe('2026-10-26')
  })

  it('cerrado hoy sigue oculto al recargar el mismo día', () => {
    window.localStorage.setItem(KEY, '2026-10-26')
    renderFab('2026-10-26')
    expect(screen.queryByRole('button', { name: /compartir horarios/i })).toBeNull()
  })

  it('vuelve al día operativo siguiente', () => {
    window.localStorage.setItem(KEY, '2026-10-26')
    renderFab('2026-10-27')
    expect(screen.getByRole('button', { name: /compartir horarios/i })).toBeInTheDocument()
  })

  it('si el storage tira excepción se muestra igual y la X lo oculta por esta visita', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    renderFab()
    expect(screen.getByRole('button', { name: /compartir horarios/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cerrar hasta mañana/i }))
    expect(screen.queryByRole('button', { name: /compartir horarios/i })).toBeNull()
  })
})
