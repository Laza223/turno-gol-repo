// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ConfirmBookingButton from '@/app/(public)/[slug]/reservar/components/ConfirmBookingButton'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'

afterEach(() => cleanup())

const props = {
  slug: 'club-x',
  court: 'c1',
  date: '2026-03-14',
  time: '21:00',
  dur: 60,
  formato: 5,
  pay: 'cash' as const,
  label: 'Reservar',
  action: vi.fn(async () => {}),
}

const bar = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-fixed-cta]')!

// Debajo de `md` el botón es una barra fija. Solo existe para jugadores, que siempre tienen la
// barra inferior: tiene que ubicarse por encima de ella DESDE EL PRIMER RENDER, sin esperar a que
// la sesión se hidrate (un fetch), o saltaría 57 px cuando llega.
const ABOVE_BOTTOM_NAV = 'bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))]'

describe('ConfirmBookingButton — la barra fija', () => {
  it('sin sesión hidratada ya está por encima del lugar de la barra inferior', () => {
    const { container } = render(<ConfirmBookingButton {...props} />)
    expect(bar(container).className).toContain(ABOVE_BOTTOM_NAV)
  })

  it('con la sesión hidratada queda exactamente donde estaba: no salta', () => {
    const sinSesion = render(<ConfirmBookingButton {...props} />)
    const antes = bar(sinSesion.container).className
    sinSesion.unmount()

    const { container } = render(
      <PortalSessionProvider
        initialValue={{
          session: {
            playerId: 'p1',
            firstName: 'Tomás',
            lastName: 'Ibáñez',
            avatarUrl: null,
            email: 'tomas@example.com',
          },
          favoriteTenantIds: new Set(),
          staffPanelPath: null,
        }}
      >
        <ConfirmBookingButton {...props} />
      </PortalSessionProvider>,
    )
    expect(bar(container).className).toBe(antes)
  })

  it('desde md vuelve al flujo, sin barra', () => {
    const { container } = render(<ConfirmBookingButton {...props} />)
    expect(bar(container).className).toMatch(/md:static/)
  })
})

describe('ConfirmBookingButton — lo que viaja y lo que dice', () => {
  it('manda el turno, el formato y cómo paga; sin formato ni pay no manda esos campos', () => {
    const { container, rerender } = render(<ConfirmBookingButton {...props} />)
    const fields = () =>
      Object.fromEntries(
        [...container.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((i) => [
          i.name,
          i.value,
        ]),
      )
    expect(fields()).toEqual({
      slug: 'club-x',
      court: 'c1',
      date: '2026-03-14',
      time: '21:00',
      dur: '60',
      formato: '5',
      pay: 'cash',
    })

    rerender(<ConfirmBookingButton {...props} formato={null} pay={null} />)
    expect(Object.keys(fields())).toEqual(['slug', 'court', 'date', 'time', 'dur'])
  })

  it('el rótulo es el que le pasan: "Reservar" o, con seña, "Pagar seña" (sin monto si está oculto)', () => {
    const { rerender } = render(<ConfirmBookingButton {...props} />)
    expect(screen.getByRole('button', { name: 'Reservar' })).toBeTruthy()

    rerender(<ConfirmBookingButton {...props} label="Pagar seña" />)
    expect(screen.getByRole('button', { name: 'Pagar seña' })).toBeTruthy()
    expect(document.body.textContent).not.toContain('$')
  })
})
