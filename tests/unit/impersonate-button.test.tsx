// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ImpersonateButton } from '@/app/(super-admin)/super-admin/tenants/[id]/_components/impersonate-button'

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('ImpersonateButton — ConfirmDialog (reemplaza window.confirm nativo, 🔴 §4.7/§8)', () => {
  it('no llama la action al primer click; abre el ConfirmDialog', async () => {
    const action = vi.fn(async () => ({ success: true as const }))
    render(<ImpersonateButton tenantId="t1" tenantName="Complejo Fénix" action={action} />)

    fireEvent.click(screen.getByRole('button', { name: 'Entrar como este complejo' }))
    expect(action).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/quedan auditadas a tu nombre de super admin/)).toBeTruthy()
  })

  it('confirmar en el diálogo dispara la action con el tenantId', async () => {
    const action = vi.fn(async () => ({ success: true as const }))
    render(<ImpersonateButton tenantId="t1" tenantName="Complejo Fénix" action={action} />)

    fireEvent.click(screen.getByRole('button', { name: 'Entrar como este complejo' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Entrar' }))

    await waitFor(() => expect(action).toHaveBeenCalledWith('t1'))
  })

  it('cancelar el diálogo no dispara la action', async () => {
    const action = vi.fn(async () => ({ success: true as const }))
    render(<ImpersonateButton tenantId="t1" tenantName="Complejo Fénix" action={action} />)

    fireEvent.click(screen.getByRole('button', { name: 'Entrar como este complejo' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(action).not.toHaveBeenCalled()
  })

  it('si la action falla, el error aparece inline en el diálogo', async () => {
    const action = vi.fn(async () => ({ success: false as const, error: 'Sin admin activo.' }))
    render(<ImpersonateButton tenantId="t1" tenantName="Complejo Fénix" action={action} />)

    fireEvent.click(screen.getByRole('button', { name: 'Entrar como este complejo' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Entrar' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Sin admin activo.')
  })
})
