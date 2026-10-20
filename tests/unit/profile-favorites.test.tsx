// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import FavoritesList, { type FavoriteRow } from '@/app/(player)/configuracion/FavoritesList'

afterEach(() => cleanup())

function fav(id: string, name: string, city = 'Rosario'): FavoriteRow {
  return { id, slug: name.toLowerCase().replace(/\s/g, '-'), name, city }
}

const THREE = [
  fav('t1', 'El Potrero'),
  fav('t2', 'La Bombonerita', 'Funes'),
  fav('t3', 'Goleada FC'),
]

function mockToggle(body: unknown, status = 200) {
  global.fetch = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof global.fetch
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('FavoritesList (Cuenta del jugador)', () => {
  it('con 3 favoritos renderiza 3 filas, en el orden recibido, sin tarjetas', () => {
    render(<FavoritesList favorites={THREE} />)
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    const filas = screen.getAllByRole('listitem')
    expect(filas).toHaveLength(3)
    expect(filas[0]!.textContent).toContain('El Potrero')
    expect(filas[1]!.textContent).toContain('Funes')
  })

  it('cada fila linkea a la página del complejo y no muestra precios', () => {
    render(<FavoritesList favorites={[fav('t1', 'El Potrero')]} />)
    expect(screen.getByRole('link', { name: /El Potrero/ }).getAttribute('href')).toBe(
      '/el-potrero',
    )
    expect(screen.getByRole('listitem').textContent).not.toContain('$')
  })

  it('sin favoritos muestra la salida a Explorar', () => {
    render(<FavoritesList favorites={[]} />)
    expect(screen.getByText(/todavía no guardaste ningún complejo/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Explorar complejos' }).getAttribute('href')).toBe(
      '/explorar',
    )
  })

  it('tiene su ancla y su encabezado', () => {
    const { container } = render(<FavoritesList favorites={THREE} />)
    expect(container.querySelector('section#favoritos')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Favoritos' })).toBeTruthy()
  })

  it('quitar uno saca la fila al instante y lo anuncia', async () => {
    mockToggle({ data: { tenantId: 't2', favorited: false } })
    render(<FavoritesList favorites={THREE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar La Bombonerita de favoritos' }))

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(screen.queryByText('La Bombonerita')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Quitaste La Bombonerita de tus favoritos.')
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      '/api/player/favorites/toggle',
      expect.objectContaining({ body: JSON.stringify({ tenantId: 't2' }) }),
    )
  })

  it('al quitar el último queda la salida a Explorar', async () => {
    mockToggle({ data: { favorited: false } })
    render(<FavoritesList favorites={[fav('t1', 'El Potrero')]} />)
    fireEvent.click(screen.getByRole('button', { name: /^Quitar/ }))
    expect(await screen.findByRole('link', { name: 'Explorar complejos' })).toBeTruthy()
  })

  it('si el servidor falla la fila se queda y el error lo dice', async () => {
    mockToggle({ error: { message: 'Algo falló' } }, 500)
    render(<FavoritesList favorites={THREE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar El Potrero de favoritos' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Algo falló')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('si otra pestaña ya lo había quitado (el toggle lo vuelve a guardar), llama una vez más y la fila se va', async () => {
    const respuestas = [{ data: { favorited: true } }, { data: { favorited: false } }]
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify(respuestas.shift())),
    ) as unknown as typeof global.fetch
    render(<FavoritesList favorites={THREE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar El Potrero de favoritos' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('El Potrero')).toBeNull()
  })

  it('si tras el segundo toggle sigue guardado, no lo da por quitado: la fila queda y hay error', async () => {
    mockToggle({ data: { favorited: true } })
    render(<FavoritesList favorites={THREE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar El Potrero de favoritos' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/No pudimos quitarlo/)
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('al quitar una fila el foco vuelve al título de la sección (la fila ya no existe)', async () => {
    mockToggle({ data: { favorited: false } })
    render(<FavoritesList favorites={THREE} />)
    const quitar = screen.getByRole('button', { name: 'Quitar El Potrero de favoritos' })
    quitar.focus()
    fireEvent.click(quitar)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 2, name: 'Favoritos' }),
    )
  })

  it('sin sesión (401) manda a /ingresar y vuelve a la sección Favoritos; no saca la fila', async () => {
    mockToggle({}, 401)
    const assign = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign },
    })
    try {
      render(<FavoritesList favorites={THREE} />)
      fireEvent.click(screen.getByRole('button', { name: 'Quitar El Potrero de favoritos' }))
      await waitFor(() => expect(assign).toHaveBeenCalledTimes(1))
      expect(assign).toHaveBeenCalledWith(
        `/ingresar?next=${encodeURIComponent('/configuracion#favoritos')}`,
      )
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })
})
