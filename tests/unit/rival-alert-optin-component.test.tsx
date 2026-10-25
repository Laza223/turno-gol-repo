// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AlertOptIn } from '@/app/(player)/rival/AlertOptIn'

afterEach(cleanup)

const ok = vi.fn(async () => ({ success: true as const }))
const tenants = [
  { id: 't1', name: 'El Vagón' },
  { id: 't2', name: 'Open Door' },
]

async function pick(name: string) {
  const trigger = screen.getByRole('button', { name: 'Avisame de partidos en' })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  fireEvent.click(await screen.findByRole('menuitemradio', { name }))
}

describe('AlertOptIn: precarga de la suscripción guardada', () => {
  it('al elegir un complejo con "solo arquero" guardado, la casilla viene marcada y el botón dice "Actualizar aviso"', async () => {
    render(
      <AlertOptIn
        tenants={tenants}
        signedIn
        subscribed={[{ tenantId: 't1', onlyGoalkeeper: true }]}
        action={ok}
        unsubscribeAction={ok}
      />,
    )
    expect(screen.getByRole('button', { name: 'Avisame cuando haya' })).toBeTruthy()
    await pick('El Vagón')
    expect(
      (screen.getByRole('checkbox', { name: 'Solo si buscan arquero' }) as HTMLInputElement)
        .checked,
    ).toBe(true)
    expect(screen.getByRole('button', { name: 'Actualizar aviso' })).toBeTruthy()
  })

  it('un complejo sin suscripción deja la casilla como el jugador la dejó', async () => {
    render(
      <AlertOptIn
        tenants={tenants}
        signedIn
        subscribed={[{ tenantId: 't1', onlyGoalkeeper: true }]}
        action={ok}
        unsubscribeAction={ok}
      />,
    )
    await pick('Open Door')
    expect(
      (screen.getByRole('checkbox', { name: 'Solo si buscan arquero' }) as HTMLInputElement)
        .checked,
    ).toBe(false)
    expect(screen.getByRole('button', { name: 'Avisame cuando haya' })).toBeTruthy()
  })
})
