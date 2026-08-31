// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportCsvButton } from '@/app/(admin)/analiticas/ExportCsvButton'

const toastMock = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  toast: (args: unknown) => toastMock(args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ExportCsvButton', () => {
  it('renders button with Exportar CSV text', () => {
    render(<ExportCsvButton from="2026-08-01" to="2026-08-31" />)
    expect(screen.getByRole('button', { name: /Exportar CSV/i })).toBeInTheDocument()
  })

  it('triggers error toast when server returns error (e.g. 403 on impersonation)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'El complejo está bloqueado.' } }),
    }) as never

    render(<ExportCsvButton from="2026-08-01" to="2026-08-31" />)
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/i }))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Error al exportar',
        description: 'El complejo está bloqueado.',
        variant: 'destructive',
      })
    })
  })
})
