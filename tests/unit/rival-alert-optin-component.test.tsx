// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByRole('button', { name: 'Avisarme por mail' })).toBeTruthy()
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
    expect(screen.getByRole('button', { name: 'Avisarme por mail' })).toBeTruthy()
  })
})

describe('AlertOptIn: complejo elegido desde el filtro del tablón', () => {
  it('con defaultTenantId llega elegido, con la preferencia guardada cargada', () => {
    render(
      <AlertOptIn
        tenants={tenants}
        signedIn
        subscribed={[{ tenantId: 't2', onlyGoalkeeper: true }]}
        defaultTenantId="t2"
        action={ok}
        unsubscribeAction={ok}
      />,
    )
    expect(screen.getByRole('button', { name: 'Avisame de partidos en' }).textContent).toContain(
      'Open Door',
    )
    expect(
      (screen.getByRole('checkbox', { name: 'Solo si buscan arquero' }) as HTMLInputElement)
        .checked,
    ).toBe(true)
    expect(screen.getByRole('button', { name: 'Actualizar aviso' })).toBeTruthy()
  })

  it('un defaultTenantId que no está entre los complejos se ignora', () => {
    render(
      <AlertOptIn
        tenants={tenants}
        signedIn
        subscribed={[]}
        defaultTenantId="otro"
        action={ok}
        unsubscribeAction={ok}
      />,
    )
    expect(screen.getByRole('button', { name: 'Avisame de partidos en' }).textContent).toContain(
      'Elegí un complejo',
    )
  })
})

describe('AlertOptIn: mensajes del último envío', () => {
  it('al cambiar de complejo se va el "Listo" del complejo anterior', async () => {
    render(
      <AlertOptIn
        tenants={tenants}
        signedIn
        subscribed={[]}
        defaultTenantId="t1"
        action={ok}
        unsubscribeAction={ok}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Avisarme por mail' }))
    await screen.findByText(/Listo, te avisamos por mail/)
    await pick('Open Door')
    expect(screen.queryByText(/Listo, te avisamos por mail/)).toBeNull()
  })

  it('un corte de red se dice en el form (no va al error boundary) y no pierde la selección', async () => {
    const offline = vi.fn(async (): Promise<{ success: true }> => {
      throw new TypeError('Failed to fetch')
    })
    render(
      <AlertOptIn
        tenants={tenants}
        signedIn
        subscribed={[]}
        defaultTenantId="t1"
        action={offline}
        unsubscribeAction={ok}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Avisarme por mail' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'No pudimos conectar. Revisá tu conexión y probá de nuevo.',
      ),
    )
    expect(screen.getByRole('button', { name: 'Avisame de partidos en' }).textContent).toContain(
      'El Vagón',
    )
  })
})
