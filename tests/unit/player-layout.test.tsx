// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(async () => ({ type: 'player', playerId: 'player-1' })),
}))
vi.mock('@/modules/auth/sign-out.action', () => ({ signOutAction: vi.fn() }))
vi.mock('@/modules/players/portal-session', () => ({ getPortalSession: vi.fn(async () => null) }))
// El cascarón (cabecera, pie, barra inferior) es de otro test: acá solo importa qué cuelga de él.
vi.mock('@/components/site/PortalShell', () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="shell">{children}</div>,
}))

import PlayerLayout from '@/app/(player)/layout'

afterEach(cleanup)

describe('(player) layout', () => {
  it('no monta el mundo de La Reserva: las páginas del grupo cuelgan directo del cascarón de La Previa', async () => {
    const { container } = render(
      await PlayerLayout({
        children: <p>contenido</p>,
      }),
    )
    expect(container.querySelector('[data-world="portal"]')).toBeNull()
    // Dentro del cascarón, que es el que pinta el <main>.
    const shell = container.querySelector('[data-testid="shell"]')
    expect(shell?.textContent).toBe('contenido')
  })

  it('Mis reservas ya no monta su propio mundo: lo hereda del grupo', async () => {
    const { existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    expect(existsSync(resolve(__dirname, '../../src/app/(player)/mis-reservas/layout.tsx'))).toBe(
      false,
    )
  })
})
