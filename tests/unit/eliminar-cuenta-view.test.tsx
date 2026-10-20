// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { EliminarCuentaView } from '@/app/(player)/eliminar-cuenta/EliminarCuentaView'

afterEach(cleanup)

function renderView(futureConfirmedCount: number) {
  return render(
    <EliminarCuentaView
      futureConfirmedCount={futureConfirmedCount}
      confirmEmail="Tomas.Ibanez@example.com"
      action={vi.fn(async () => ({ success: true as const }))}
    />,
  )
}

describe('EliminarCuentaView', () => {
  it('con 1 reserva dice "1 reserva confirmada" (singular)', () => {
    renderView(1)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Tenés 1 reserva confirmada por jugar' }),
    ).toBeTruthy()
    expect(screen.queryByText(/reservas confirmadas/)).toBeNull()
  })

  it('con 3 reservas dice "3 reservas confirmadas" (plural)', () => {
    renderView(3)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Tenés 3 reservas confirmadas por jugar' }),
    ).toBeTruthy()
  })

  it('sin reservas por jugar no hay aviso', () => {
    renderView(0)
    expect(screen.queryByText(/por jugar/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Ver mis reservas' })).toBeNull()
  })

  it('con reservas ofrece verlas', () => {
    renderView(2)
    expect(screen.getByRole('link', { name: 'Ver mis reservas' }).getAttribute('href')).toBe(
      '/mis-reservas',
    )
  })

  it('una sola explicación, sin jerga: la ley se nombra una vez', () => {
    const { container } = renderView(0)
    expect(screen.getByText(/Esta acción es irreversible/)).toBeTruthy()
    expect(container.textContent?.match(/Ley 25\.326/g)).toHaveLength(1)
    expect(container.textContent).not.toMatch(/AFIP|Art\. 22|ARCO/)
    expect(container.textContent).toContain('sin tu nombre')
  })

  it('descargar los datos está en la misma página', () => {
    renderView(0)
    expect(screen.getByRole('button', { name: 'Descargar mis datos' })).toBeTruthy()
  })

  it('un solo color de alarma: no hay tarjetas roja, naranja ni ámbar', () => {
    const { container } = renderView(2)
    expect(container.innerHTML).not.toMatch(/orange-|amber-|bg-red-50|border-red-/)
  })

  it('el botón de alarma no ocupa todo el ancho y no lleva sombra', () => {
    renderView(0)
    const boton = screen.getByRole('button', { name: 'Eliminar mi cuenta' })
    expect(boton.className).not.toMatch(/\bw-full\b/)
    expect(boton.className).toContain('shadow-none')
  })

  it('el email confirma sin importar mayúsculas ni espacios, y el campo se arma para un email', async () => {
    renderView(0)
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    const dialogo = await screen.findByRole('dialog')
    const confirmar = within(dialogo).getByRole('button', {
      name: 'Eliminar mi cuenta',
    }) as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)

    const campo = within(dialogo).getByLabelText(/Escribí/) as HTMLInputElement
    expect(campo.getAttribute('autocapitalize')).toBe('none')
    expect(campo.getAttribute('autocorrect')).toBe('off')
    expect(campo.getAttribute('spellcheck')).toBe('false')
    expect(campo.getAttribute('inputmode')).toBe('email')

    fireEvent.change(campo, { target: { value: '  tomas.ibanez@EXAMPLE.com ' } })
    await waitFor(() => expect(confirmar.disabled).toBe(false))
    fireEvent.change(campo, { target: { value: 'otra.persona@example.com' } })
    await waitFor(() => expect(confirmar.disabled).toBe(true))
  })

  it('tiene una salida visible: "Volver a Mi cuenta", de 44 px', () => {
    renderView(0)
    const link = screen.getByRole('link', { name: 'Volver a Mi cuenta' })
    expect(link.getAttribute('href')).toBe('/configuracion')
    expect(link.className).toContain('min-h-11')
  })

  it('el copy no promete de más: no dice "se borran tus datos" (reservas y pagos quedan, sin tu nombre)', async () => {
    const { container } = renderView(0)
    expect(container.textContent).not.toMatch(/se borran tus datos/i)
    expect(container.textContent).toContain('Borramos tu nombre, tu email, tu teléfono')
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo.textContent).not.toMatch(/se borran tus datos/i)
    expect(dialogo.textContent).toContain('Borramos tu nombre, email y teléfono')
    expect(dialogo.textContent).toContain('quedan en los complejos, sin tus datos')
  })
})
