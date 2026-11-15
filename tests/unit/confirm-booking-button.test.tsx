// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ConfirmBookingButton from '@/app/(public)/[slug]/reservar/components/ConfirmBookingButton'

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

// Portal de vidrio F5 (`reservar.html`): el botón va en el flujo, debajo del resumen, y ya no es una
// barra fija. Sin `data-fixed-cta`, `PortalFrame` no suma relleno abajo (eso queda para RIVAL).
describe('ConfirmBookingButton — en el flujo', () => {
  it('no es una barra fija ni le avisa al marco', () => {
    const { container } = render(<ConfirmBookingButton {...props} />)
    expect(container.querySelector('[data-fixed-cta]')).toBeNull()
    expect(container.innerHTML).not.toContain('fixed')
  })

  it('es la píldora verde de 52 px, a todo el ancho', () => {
    render(<ConfirmBookingButton {...props} />)
    const button = screen.getByRole('button', { name: 'Reservar' })
    expect(button.className).toContain('h-13')
    expect(button.className).toContain('w-full')
    expect(button.className).toContain('rounded-full')
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
