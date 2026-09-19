// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

/**
 * El contenedor del panel tiene dos modos: full-bleed (`/grilla`, `/reservas`)
 * y normal con tope de 1600 px (todo lo demás). El fondo con gradiente va en el
 * contenedor SIN tope: en el `<main>` el tope dibuja una caja con franjas de
 * otro tono a los costados (franjas laterales muertas en un monitor de 1920).
 */

let pathname = '/dashboard'

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/components/layout/admin-sidebar', () => ({ AdminSidebar: () => null }))
vi.mock('@/components/layout/admin-bottom-nav', () => ({ AdminBottomNav: () => null }))
vi.mock('@/components/layout/admin-header', () => ({ AdminHeader: () => null }))
vi.mock('@/components/layout/status-banner', () => ({ StatusBanner: () => null }))
vi.mock('@/components/admin/PushNotificationManagerLoader', () => ({
  PushNotificationManagerLoader: () => null,
}))

import { AdminLayoutShell } from '@/components/layout/admin-layout-shell'

function renderShell(path: string) {
  pathname = path
  const { container } = render(
    <AdminLayoutShell
      tenantName="Complejo Fénix"
      tenantStatus="active"
      trialEndsAt={null}
      periodEnd={null}
      userEmail="marcelo@complejofenix.com.ar"
      signOut={vi.fn(() => new Promise<never>(() => {}))}
    >
      <p>contenido</p>
    </AdminLayoutShell>,
  )
  const main = container.querySelector('main')
  if (!main) throw new Error('el shell no renderizó un <main>')
  const wrapper = main.parentElement?.parentElement
  if (!wrapper) throw new Error('el <main> no tiene el contenedor de contenido')
  return { main, wrapper }
}

beforeEach(() => {
  pathname = '/dashboard'
})

describe('AdminLayoutShell — ancho del contenedor', () => {
  it.each([
    '/dashboard',
    '/canchas',
    '/jugadores',
    '/jugadores/abc',
    '/abonados',
    '/caja',
    '/reservas/abc',
  ])('%s va con tope de 1600 px, no de 1280', (path) => {
    const { main } = renderShell(path)
    expect(main.className).toContain('max-w-[1600px]')
    expect(main.className).not.toContain('max-w-7xl')
  })

  it.each(['/grilla', '/reservas'])('%s es full-bleed, sin tope de ancho', (path) => {
    const { main } = renderShell(path)
    expect(main.className).toContain('max-w-full')
    expect(main.className).not.toContain('max-w-[1600px]')
  })

  it('el fondo con gradiente va en el contenedor sin tope, no en el <main>', () => {
    for (const path of ['/dashboard', '/grilla']) {
      const { main, wrapper } = renderShell(path)
      expect(wrapper.className).toContain('content-area-gradient')
      expect(main.className).not.toContain('content-area-gradient')
    }
  })

  it('conserva el ancla del skip-link', () => {
    const { main } = renderShell('/canchas')
    expect(main.id).toBe('main-content')
  })
})
