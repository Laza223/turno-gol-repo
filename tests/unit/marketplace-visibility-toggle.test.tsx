// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketplaceVisibilityToggle } from '@/app/(super-admin)/super-admin/tenants/[id]/_components/marketplace-visibility-toggle'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MarketplaceVisibilityToggle', () => {
  it('renderiza con estado visible inicial (true)', () => {
    const action = vi.fn().mockResolvedValue({ success: true })
    render(
      <MarketplaceVisibilityToggle tenantId="tenant-1" initialVisible={true} action={action} />,
    )

    const switchBtn = screen.getByRole('switch', { name: /visibilidad en marketplace público/i })
    expect(switchBtn).toBeInTheDocument()
    expect(switchBtn).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Visible')).toBeInTheDocument()
  })

  it('renderiza con estado oculto inicial (false)', () => {
    const action = vi.fn().mockResolvedValue({ success: true })
    render(
      <MarketplaceVisibilityToggle tenantId="tenant-1" initialVisible={false} action={action} />,
    )

    const switchBtn = screen.getByRole('switch', { name: /visibilidad en marketplace público/i })
    expect(switchBtn).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Oculto')).toBeInTheDocument()
  })

  it('al hacer click cambia visibilidad y ejecuta la action con el nuevo valor', async () => {
    const action = vi.fn().mockResolvedValue({ success: true, message: 'Actualizado' })
    render(
      <MarketplaceVisibilityToggle tenantId="tenant-1" initialVisible={true} action={action} />,
    )

    const switchBtn = screen.getByRole('switch', { name: /visibilidad en marketplace público/i })
    fireEvent.click(switchBtn)

    expect(action).toHaveBeenCalledWith('tenant-1', false)
    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
      expect(screen.getByText('Oculto')).toBeInTheDocument()
    })
  })

  it('en caso de error en la action, revierte el estado y muestra mensaje de error', async () => {
    const action = vi.fn().mockResolvedValue({ success: false, error: 'Permiso denegado.' })
    render(
      <MarketplaceVisibilityToggle tenantId="tenant-1" initialVisible={true} action={action} />,
    )

    const switchBtn = screen.getByRole('switch', { name: /visibilidad en marketplace público/i })
    fireEvent.click(switchBtn)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Permiso denegado.')
      expect(screen.getByText('Visible')).toBeInTheDocument()
      expect(switchBtn).toHaveAttribute('aria-checked', 'true')
    })
  })
})
