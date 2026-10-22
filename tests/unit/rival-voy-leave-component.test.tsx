// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LeaveMatch } from '@/app/(player)/rival/p/[code]/LeaveMatch'
import { VoyPanel } from '@/app/(player)/rival/p/[code]/VoyPanel'

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

const accept = vi.fn(async () => ({ success: true as const }))

function renderVoy(over: Partial<Parameters<typeof VoyPanel>[0]> = {}) {
  const join = vi.fn(async () => ({ success: true as const }))
  render(
    <VoyPanel
      code="ABCDEFGHJK"
      welcome={null}
      autoJoin={false}
      openWelcome={false}
      intentParam="rival_intent"
      joinAction={join}
      acceptAndJoinAction={accept}
      {...over}
    />,
  )
  return join
}

describe('VoyPanel', () => {
  it('con la bienvenida aceptada, "Voy" suma directo con el código del link', async () => {
    const join = renderVoy()
    fireEvent.click(screen.getByRole('button', { name: 'Voy' }))
    await waitFor(() => expect(join).toHaveBeenCalledWith('ABCDEFGHJK'))
  })

  it('si la action falla, muestra el error y el botón sigue', async () => {
    const join = vi.fn(async () => ({
      success: false as const,
      error: 'El partido ya está completo.',
    }))
    renderVoy({ joinAction: join })
    fireEvent.click(screen.getByRole('button', { name: 'Voy' }))
    expect((await screen.findByRole('alert')).textContent).toBe('El partido ya está completo.')
    expect(screen.getByRole('button', { name: 'Voy' })).toBeTruthy()
  })

  it('sin bienvenida, "Voy" no suma: abre la tarjeta con "Estoy adentro"', () => {
    const join = renderVoy({ welcome: { firstName: 'Lazaro', position: null, zone: null } })
    expect(screen.queryByRole('button', { name: 'Estoy adentro' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Voy' }))
    expect(screen.getByRole('button', { name: 'Estoy adentro' })).toBeTruthy()
    expect(join).not.toHaveBeenCalled()
  })

  it('vuelta del login con bienvenida pendiente: tarjeta abierta y NINGÚN autoenvío', () => {
    const join = renderVoy({
      welcome: { firstName: 'Lazaro', position: null, zone: null },
      openWelcome: true,
    })
    expect(screen.getByRole('button', { name: 'Estoy adentro' })).toBeTruthy()
    expect(join).not.toHaveBeenCalled()
    expect(accept).not.toHaveBeenCalled()
  })

  it('vuelta del login con intento válido y bienvenida aceptada: se suma sola, UNA vez', async () => {
    const join = renderVoy({ autoJoin: true })
    await waitFor(() => expect(join).toHaveBeenCalledTimes(1))
    expect(join).toHaveBeenCalledWith('ABCDEFGHJK')
  })

  it('el autoenvío no se repite si la pantalla vuelve a montarse en la misma pestaña', async () => {
    const first = renderVoy({ autoJoin: true })
    await waitFor(() => expect(first).toHaveBeenCalledTimes(1))
    cleanup()
    const second = renderVoy({ autoJoin: true })
    await new Promise((r) => setTimeout(r, 20))
    expect(second).not.toHaveBeenCalled()
  })
})

describe('LeaveMatch', () => {
  it('"Me bajo" pide confirmación y recién ahí llama a la action con el partido', async () => {
    const leave = vi.fn(async () => ({ success: true as const }))
    render(<LeaveMatch matchId="m1" leaveAction={leave} />)
    expect(
      screen.getByText('Si no podés ir, bajate a tiempo: alguien del banco ocupa tu lugar.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Me bajo' }))
    expect(leave).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, me bajo' }))
    await waitFor(() => expect(leave).toHaveBeenCalledWith('m1'))
  })

  it('"No, voy" cierra sin bajarse', async () => {
    const leave = vi.fn(async () => ({ success: true as const }))
    render(<LeaveMatch matchId="m1" leaveAction={leave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Me bajo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'No, voy' }))
    expect(leave).not.toHaveBeenCalled()
  })
})
