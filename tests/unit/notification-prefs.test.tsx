// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const updateMock = vi.fn()
vi.mock('@/app/(player)/perfil/actions', () => ({
  updateNotificationPrefAction: (...args: unknown[]) => updateMock(...args),
}))

import NotificationPrefs from '@/app/(player)/perfil/NotificationPrefs'

beforeEach(() => updateMock.mockReset())
afterEach(() => cleanup())

describe('NotificationPrefs', () => {
  it('renderiza ambos switches con el estado inicial del jugador', () => {
    render(<NotificationPrefs initialEmail={true} initialPush={false} />)
    const email = screen.getByRole('switch', { name: 'Novedades por email' })
    const push = screen.getByRole('switch', { name: 'Notificaciones push' })
    expect(email.getAttribute('aria-checked')).toBe('true')
    expect(push.getAttribute('aria-checked')).toBe('false')
  })

  it('togglear llama a la action con la pref correcta y cambia optimista', async () => {
    updateMock.mockResolvedValue({ success: true })
    render(<NotificationPrefs initialEmail={true} initialPush={true} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Novedades por email' }))

    expect(updateMock).toHaveBeenCalledWith('email', false)
    await waitFor(() => {
      expect(
        screen
          .getByRole('switch', { name: 'Novedades por email' })
          .getAttribute('aria-checked'),
      ).toBe('false')
    })
    // El otro switch no se toca.
    expect(
      screen.getByRole('switch', { name: 'Notificaciones push' }).getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('si la action falla, el switch revierte y muestra el error', async () => {
    updateMock.mockResolvedValue({ success: false, error: 'No pudimos guardar tu preferencia.' })
    render(<NotificationPrefs initialEmail={true} initialPush={true} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Notificaciones push' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('No pudimos guardar')
    })
    expect(
      screen.getByRole('switch', { name: 'Notificaciones push' }).getAttribute('aria-checked'),
    ).toBe('true')
  })
})
