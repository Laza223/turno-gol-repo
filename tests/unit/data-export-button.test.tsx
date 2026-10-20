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

  it('avisa cuando la descarga terminó, en una región viva', async () => {
    mockFetch({ data: { hola: 'mundo' } })
    render(<DataExportButton />)
    // La región viva ya está montada antes de que haya algo que anunciar.
    const estado = screen.getByRole('status')
    expect(estado.getAttribute('aria-live')).toBe('polite')
    expect(estado.textContent).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(
        /^Listo, se descargó turnogol-mis-datos-\d{4}-\d{2}-\d{2}\.json\.$/,
      )
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('mientras genera dice "Generando…" con un solo carácter de puntos suspensivos', async () => {
    let release: () => void = () => {}
    global.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(JSON.stringify({ data: {} })))
        }),
    ) as unknown as typeof global.fetch
    render(<DataExportButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }))

    const boton = await screen.findByRole('button', { name: 'Generando…' })
    expect((boton as HTMLButtonElement).disabled).toBe(true)
    expect(boton.textContent).not.toContain('...')
    expect(screen.getByRole('status').textContent).toBe('Estamos armando tu archivo.')
    release()
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/^Listo/))
  })

  it('el error se pinta en 13 px o más, sin los 12 px de text-xs', async () => {
    mockFetch({}, false)
    render(<DataExportButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta.className).not.toContain('text-xs')
    expect(alerta.className).toContain('text-[13px]')
  })
})
