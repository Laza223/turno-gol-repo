// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'

/**
 * Tests livianos del layout SuperAdmin — sin DB, sin Supabase.
 *
 * - El guard se mockea ENTERO (@/modules/auth/system-admin.guards): acá solo
 *   verificamos que el layout lo llama y cablea el shell; el guard tiene su
 *   propia suite.
 * - El side-effect de last_login se mockea vía @/shared/db/client.
 */

const requireSystemAdminMock = vi.fn()

vi.mock('@/modules/auth/system-admin.guards', () => ({
  requireSystemAdmin: (): unknown => requireSystemAdminMock(),
}))

const withSystemAdminContextMock = vi.fn(
  async (_id: string, _fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => [],
)

vi.mock('@/shared/db/client', () => ({
  withSystemAdminContext: (_id: string, fn: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
    withSystemAdminContextMock(_id, fn),
  getDb: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: () => ({
    get: (name: string) =>
      name.toLowerCase() === 'x-forwarded-for' ? '203.0.113.7, 10.0.0.1' : null,
  }),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/super-admin',
  redirect: vi.fn(),
}))

// signOutAction es 'use server' y arrastra el cliente Supabase (exige env).
vi.mock('@/app/(admin)/actions/auth', () => ({
  signOutAction: vi.fn(),
}))

import SuperAdminLayout, { metadata } from '@/app/(super-admin)/super-admin/layout'
import { SuperAdminLayoutShell } from '@/components/layout/super-admin-layout-shell'

const AUTH_FIXTURE = {
  user: {
    type: 'system_admin' as const,
    id: 'auth-user-1',
    email: 'duenio@turnogol.app',
    systemAdminId: 'sa-1',
  },
  admin: {
    id: 'sa-1',
    email: 'duenio@turnogol.app',
    firstName: 'Lázaro',
    lastName: 'Feijoo',
  },
}

beforeEach(() => {
  requireSystemAdminMock.mockReset()
  requireSystemAdminMock.mockResolvedValue(AUTH_FIXTURE)
  withSystemAdminContextMock.mockClear()
})

describe('metadata del layout super-admin', () => {
  it('marca el panel como noindex/nofollow', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})

describe('SuperAdminLayout (server component)', () => {
  it('exige el guard y pasa email/nombre del admin al shell', async () => {
    const tree = (await SuperAdminLayout({
      children: 'contenido' as ReactNode,
    })) as ReactElement

    expect(requireSystemAdminMock).toHaveBeenCalledTimes(1)
    expect(isValidElement(tree)).toBe(true)
    expect(tree.type).toBe(SuperAdminLayoutShell)
    const props = tree.props as { userEmail: string; adminName: string }
    expect(props.userEmail).toBe('duenio@turnogol.app')
    expect(props.adminName).toBe('Lázaro Feijoo')
  })

  it('no rompe el render si el update de last_login falla', async () => {
    withSystemAdminContextMock.mockRejectedValueOnce(new Error('db caída'))
    const tree = (await SuperAdminLayout({
      children: 'contenido' as ReactNode,
    })) as ReactElement
    expect(isValidElement(tree)).toBe(true)
  })
})

describe('SuperAdminLayoutShell', () => {
  it('renderiza los links a /super-admin y /super-admin/tenants', () => {
    render(
      <SuperAdminLayoutShell
        userEmail="duenio@turnogol.app"
        adminName="Lázaro Feijoo"
        signOut={vi.fn() as unknown as () => Promise<never>}
      >
        <p>hola</p>
      </SuperAdminLayoutShell>,
    )

    const hrefs = screen.getAllByRole('link', { hidden: true }).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/super-admin')
    expect(hrefs).toContain('/super-admin/tenants')
  })

  it('muestra el título del panel y el email del admin', () => {
    render(
      <SuperAdminLayoutShell
        userEmail="duenio@turnogol.app"
        adminName="Lázaro Feijoo"
        signOut={vi.fn() as unknown as () => Promise<never>}
      >
        <p>hola</p>
      </SuperAdminLayoutShell>,
    )

    // El título aparece en la sidebar desktop Y en la mobile (drawer).
    expect(screen.getAllByText('TurnoGol — SuperAdmin').length).toBeGreaterThan(0)
    expect(screen.getAllByText('duenio@turnogol.app').length).toBeGreaterThan(0)
  })
})
