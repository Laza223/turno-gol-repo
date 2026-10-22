// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NewMatchForm } from '@/app/(player)/rival/nuevo/NewMatchForm'
import type { RivalFormResult } from '@/app/(player)/rival/actions'

afterEach(() => cleanup())

// Sábado 21:00 ART = 00:00 UTC del domingo.
const BOOKINGS = [{ tenantId: 't1', startsAt: '2026-03-15T00:00:00.000Z' }]
const PREFILL = { tenantId: 't1', date: '2026-03-14', time: '21:00', format: 7 }

function renderForm(action: () => Promise<RivalFormResult>, locked: boolean) {
  return render(
    <NewMatchForm
      tenants={[{ id: 't1', name: 'El Vagón', city: 'Luján' }]}
      bookings={BOOKINGS}
      prefill={locked ? PREFILL : null}
      today="2026-03-14"
      nowTime="15:30"
      action={action}
    />,
  )
}

async function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Armar el partido' }))
}

describe('NewMatchForm — errores de campos que la reserva fijada oculta', () => {
  it.each(['tenantId', 'startsAt', 'format'])(
    'con la reserva fijada, el error de "%s" se ve como alert (no hay campo donde pintarlo)',
    async (field) => {
      renderForm(
        vi.fn(async () => ({
          success: false,
          error: 'Solo se puede armar hasta 7 días adelante.',
          field,
        })),
        true,
      )
      await submit()
      expect((await screen.findByRole('alert')).textContent).toContain('hasta 7 días')
    },
  )

  it('sin reserva fijada, el error de "startsAt" no se duplica arriba del botón (lo pinta su campo)', async () => {
    renderForm(
      vi.fn(async () => ({ success: false, error: 'Fecha mala.', field: 'startsAt' })),
      false,
    )
    await submit()
    await waitFor(() => expect(screen.queryAllByText('Fecha mala.').length).toBeLessThanOrEqual(1))
  })
})

describe('NewMatchForm — el sello y la reserva que se cayó', () => {
  it('con sello no hay casilla; si el server pide courtDeclared, aparece "Ya tengo la cancha" y se puede seguir', async () => {
    renderForm(
      vi.fn(async () => ({
        success: false,
        error: 'Confirmá que tenés la cancha.',
        field: 'courtDeclared',
      })),
      true,
    )
    expect(screen.queryByRole('checkbox', { name: 'Ya tengo la cancha' })).toBeNull()
    await submit()
    const box = await screen.findByRole('checkbox', { name: 'Ya tengo la cancha' })
    expect(screen.getByRole('alert').textContent).toContain('Confirmá que tenés la cancha.')
    fireEvent.click(box)
    expect((box as HTMLInputElement).checked).toBe(true)
  })
})
