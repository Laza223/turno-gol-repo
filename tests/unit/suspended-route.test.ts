// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement } from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/auth/auth.service', () => ({ resolveStaffTenants: vi.fn() }))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { resolveStaffTenants } from '@/modules/auth/auth.service'
import SuspendedPage, { metadata } from '@/app/(public)/suspended/page'

function sesionStaff() {
  vi.mocked(extractAuthUser).mockResolvedValue({
    type: 'staff',
    id: 'auth-1',
    email: 'staff@test.local',
    staffUserId: 'staff-1',
    tenantId: 'tenant-1',
    role: 'admin',
  })
}

/** Solo importa el largo: la página no mira nada más de la lista. */
function complejos(cantidad: number) {
  vi.mocked(resolveStaffTenants).mockResolvedValue(
    Array.from({ length: cantidad }, (_, i) => ({
      tenantId: `tenant-${i}`,
      tenantName: `Complejo ${i}`,
      tenantSlug: `complejo-${i}`,
      role: 'admin',
    })),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(null)
  complejos(0)
})

/**
 * BLOCKER (triage_fixes #3/#6): el kill-switch (redirectIfTenantSuspended) y los
 * settings redirigen a /suspended. El triage afirmaba que la ruta no existía
 * (404), pero sí existe en src/app/(public)/suspended/page.tsx — los hallazgos no
 * eran vigentes (ver docs/qa/decisiones_pendientes.md). Este test es la guarda de
 * regresión que evita que la ruta vuelva a desaparecer silenciosamente.
 */
describe('/suspended (destino del kill-switch)', () => {
  it('existe y renderiza un árbol de React válido', async () => {
    expect(typeof SuspendedPage).toBe('function')
    expect(isValidElement(await SuspendedPage())).toBe(true)
  })

  it('está excluida de la indexación de buscadores', () => {
    const robots = metadata.robots as { index?: boolean; follow?: boolean } | null
    expect(robots?.index).toBe(false)
    expect(robots?.follow).toBe(false)
  })

  // 🟡 QA 2026-08-14: el título traía su propio "— TurnoGol" y el template del
  // layout raíz (`%s · TurnoGol`) lo volvía a concatenar → "Cuenta suspendida —
  // TurnoGol · TurnoGol", también en og:title. Este test existía pero solo
  // miraba `robots`, así que no lo atrapó.
  it('el título no repite el nombre del sitio (lo agrega el template raíz)', () => {
    expect(metadata.title).toBe('Cuenta suspendida')
    expect(String(metadata.title)).not.toMatch(/TurnoGol/)
  })
})

/**
 * AUD-01: honrar el complejo elegido hace que elegir uno bloqueado traiga acá en
 * vez de entrar callado al otro. Sin esta salida, volver al que sí opera exigía
 * escribir /select-tenant a mano.
 */
describe('/suspended — la salida para el staff multi-complejo', () => {
  it('con dos o más complejos ofrece cambiar de complejo', async () => {
    sesionStaff()
    complejos(2)

    render(await SuspendedPage())

    expect(screen.getByRole('link', { name: 'Cambiar de complejo' })).toHaveAttribute(
      'href',
      '/select-tenant',
    )
  })

  it('con un solo complejo no la ofrece', async () => {
    sesionStaff()
    complejos(1)

    render(await SuspendedPage())

    expect(screen.queryByRole('link', { name: 'Cambiar de complejo' })).toBeNull()
  })

  it('sin sesión de staff no la ofrece ni consulta membresías', async () => {
    render(await SuspendedPage())

    expect(screen.queryByRole('link', { name: 'Cambiar de complejo' })).toBeNull()
    expect(resolveStaffTenants).not.toHaveBeenCalled()
  })
})
