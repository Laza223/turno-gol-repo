// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ isRivalEnabled: vi.fn(async () => true) }))
vi.mock('@/modules/rival/rival.flags', () => ({ isRivalEnabled: mocks.isRivalEnabled }))

import { MatchNotFound } from '@/app/(player)/rival/MatchNotFound'

afterEach(cleanup)

describe('MatchNotFound', () => {
  it('con RIVAL prendido dice que el partido ya no está y ofrece el tablón', async () => {
    mocks.isRivalEnabled.mockResolvedValue(true)
    render(await MatchNotFound())
    expect(screen.getByText('Este partido ya no está')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver el tablón' }).getAttribute('href')).toBe('/rival')
    // Sin sesión `/rival/nuevo` mandaría a `/ingresar`, que por email no crea cuenta.
    expect(screen.queryByRole('link', { name: 'Armar un partido' })).toBeNull()
  })

  it('con el flag apagado es el 404 del sitio: ni copy ni links de RIVAL', async () => {
    mocks.isRivalEnabled.mockResolvedValue(false)
    render(await MatchNotFound())
    expect(screen.getByText('Página no encontrada')).toBeTruthy()
    expect(screen.queryByText(/partido/i)).toBeNull()
    expect(document.querySelector('a[href^="/rival"]')).toBeNull()
  })
})
