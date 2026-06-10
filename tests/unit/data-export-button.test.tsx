// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DataExportButton } from '@/app/(player)/configuracion/DataExportButton'

const createObjectURL = vi.fn(() => 'blob:fake')
const revokeObjectURL = vi.fn()

beforeEach(() => {
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
  createObjectURL.mockClear()
})

afterEach(() => cleanup())

function mockFetch(body: unknown, ok = true) {
  global.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: ok ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof global.fetch
}

describe('DataExportButton (#18)', () => {
  it('no descarga y muestra error si el 200 no tiene el campo data', async () => {
    mockFetch({}) // 200 sin `data`
    render(<DataExportButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('no descarga si data es null', async () => {
    mockFetch({ data: null })
    render(<DataExportButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('descarga cuando el payload trae data', async () => {
    mockFetch({ data: { hola: 'mundo' } })
    render(<DataExportButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }))

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
