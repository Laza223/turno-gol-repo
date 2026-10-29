// @vitest-environment happy-dom
import { useEffect, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DropIntentParam } from '@/app/(player)/rival/p/[code]/DropIntentParam'
import { LeaveMatch } from '@/app/(player)/rival/p/[code]/LeaveMatch'
import { RivalVoyGate } from '@/app/(player)/rival/p/[code]/RivalVoyGate'
import { VoyPanel } from '@/app/(player)/rival/p/[code]/VoyPanel'

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

const BOTH = { identity: true, profile: true, position: true }
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

/**
 * Imita al AppRouter de Next: engancha `history.replaceState` en un useEffect del PADRE, que en la
 * hidratación corre después del efecto del hijo. Un hijo que lo llama sin esperar usa el nativo y
 * el router repone la URL con el token después de la próxima acción.
 */
function RouterLike({ children, seen }: { children: ReactNode; seen: string[] }) {
  useEffect(() => {
    const original = window.history.replaceState.bind(window.history)
    window.history.replaceState = (data, unused, url) => {
      seen.push(String(url))
      original(data, unused, url)
    }
    return () => {
      window.history.replaceState = original
    }
  }, [seen])
  return children
}

describe('VoyPanel', () => {
  it('con el partido lleno, el botón dice "Voy al banco" y suma igual', async () => {
    const join = renderVoy({ full: true })
    expect(screen.queryByRole('button', { name: 'Voy' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Voy al banco' }))
    await waitFor(() => expect(join).toHaveBeenCalledWith('ABCDEFGHJK'))
  })

  it('lleno y con algo pendiente de la bienvenida, el botón que la abre también dice "Voy al banco"', () => {
    renderVoy({
      full: true,
      welcome: { firstName: 'Lazaro', position: null, zone: null, needs: BOTH },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Voy al banco' }))
    expect(screen.getByRole('button', { name: 'Estoy adentro' })).toBeTruthy()
  })

  it('el pendiente sigue diciendo "Sumándote…" aunque esté lleno', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const join = vi.fn(async () => {
      await gate
      return { success: true as const }
    })
    renderVoy({ full: true, joinAction: join })
    fireEvent.click(screen.getByRole('button', { name: 'Voy al banco' }))
    expect(await screen.findByRole('button', { name: 'Sumándote…' })).toBeTruthy()
    // Se libera la transición: una colgada envenenaría a los tests que siguen.
    release()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Voy al banco' })).toBeTruthy())
  })

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
    // En el flujo, no en la barra fija (su alto es fijo).
    expect((await screen.findByRole('alert')).closest('[data-fixed-cta]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Voy' })).toBeTruthy()
  })

  it('sin bienvenida, "Voy" no suma: abre la tarjeta con "Estoy adentro"', () => {
    const join = renderVoy({
      welcome: { firstName: 'Lazaro', position: null, zone: null, needs: BOTH },
    })
    expect(screen.queryByRole('button', { name: 'Estoy adentro' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Voy' }))
    expect(screen.getByRole('button', { name: 'Estoy adentro' })).toBeTruthy()
    expect(join).not.toHaveBeenCalled()
  })

  it('"Ahora no" cierra la tarjeta y el foco vuelve a "Voy"', () => {
    renderVoy({ welcome: { firstName: 'Lazaro', position: null, zone: null, needs: BOTH } })
    fireEvent.click(screen.getByRole('button', { name: 'Voy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Voy' }))
  })

  it('vuelta del login con bienvenida pendiente: tarjeta abierta y NINGÚN autoenvío', () => {
    const join = renderVoy({
      welcome: { firstName: 'Lazaro', position: null, zone: null, needs: BOTH },
      openWelcome: true,
    })
    expect(screen.getByRole('button', { name: 'Estoy adentro' })).toBeTruthy()
    expect(join).not.toHaveBeenCalled()
    expect(accept).not.toHaveBeenCalled()
  })

  it('con el perfil incompleto, el autoenvío NO suma: abre la tarjeta con solo lo que falta', () => {
    const join = renderVoy({
      autoJoin: true,
      openWelcome: true,
      welcome: {
        firstName: 'Lazaro',
        position: null,
        zone: null,
        needs: { identity: false, profile: true, position: true },
      },
    })
    expect(screen.getByRole('heading', { name: 'Un dato más para sumarte' })).toBeTruthy()
    expect(screen.queryByLabelText('Tu nombre')).toBeNull()
    expect(join).not.toHaveBeenCalled()
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

describe('VoyPanel: el intent se gasta', () => {
  it('con la bienvenida abierta, el param sale de la URL apenas se monta (no solo al autoenviar)', async () => {
    window.history.replaceState(null, '', '/rival/p/ABCDEFGHJK?rival_intent=TOKEN&otro=1')
    renderVoy({
      welcome: { firstName: 'Lazaro', position: null, zone: null, needs: BOTH },
      openWelcome: true,
    })
    await waitFor(() => expect(window.location.search).toBe('?otro=1'))
  })

  it('el router se entera: el param sale después de que el AppRouter engancha replaceState', async () => {
    const seen: string[] = []
    window.history.replaceState(null, '', '/rival/p/ABCDEFGHJK?rival_intent=TOKEN&otro=1')
    render(
      <RouterLike seen={seen}>
        <VoyPanel
          code="ABCDEFGHJK"
          welcome={{ firstName: 'Lazaro', position: null, zone: null, needs: BOTH }}
          autoJoin={false}
          openWelcome
          intentParam="rival_intent"
          joinAction={vi.fn(async () => ({ success: true as const }))}
          acceptAndJoinAction={accept}
        />
      </RouterLike>,
    )
    await waitFor(() => expect(seen).toEqual(['/rival/p/ABCDEFGHJK?otro=1']))
  })

  it('el autoenvío sale con el param ya fuera de la URL', async () => {
    window.history.replaceState(null, '', '/rival/p/ABCDEFGHJK?rival_intent=TOKEN')
    const searchAtJoin: string[] = []
    const join = vi.fn(async () => {
      searchAtJoin.push(window.location.search)
      return { success: true as const }
    })
    renderVoy({ autoJoin: true, joinAction: join })
    await waitFor(() => expect(join).toHaveBeenCalledTimes(1))
    expect(searchAtJoin).toEqual([''])
  })

  it('un rechazo de red de la action se muestra inline y no rompe', async () => {
    const join = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    renderVoy({ joinAction: join })
    fireEvent.click(screen.getByRole('button', { name: 'Voy' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/conexión/)
    expect(screen.getByRole('button', { name: 'Voy' })).toBeTruthy()
  })
})

describe('DropIntentParam', () => {
  it('saca el intent aunque no haya "Voy" (organizador, ya adentro) y el router se entera', async () => {
    const seen: string[] = []
    window.history.replaceState(null, '', '/rival/p/ABCDEFGHJK?rival_intent=TOKEN&creado=1')
    render(
      <RouterLike seen={seen}>
        <DropIntentParam param="rival_intent" />
      </RouterLike>,
    )
    await waitFor(() => expect(seen).toEqual(['/rival/p/ABCDEFGHJK?creado=1']))
  })
})

describe('LeaveMatch', () => {
  it('"Me bajo" pide confirmación y recién ahí llama a la action con el partido', async () => {
    const leave = vi.fn(async () => ({ success: true as const }))
    render(<LeaveMatch matchId="m1" leaveAction={leave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Me bajo' }))
    expect(leave).not.toHaveBeenCalled()
    // El efecto se dice una vez, en el diálogo donde se decide.
    expect(screen.getByText('Tu lugar queda libre: si hay banco, entra el primero.')).toBeTruthy()
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

describe('RivalVoyGate', () => {
  const gate = (full?: boolean) =>
    render(
      <RivalVoyGate
        code="ABCDEFGHJK"
        {...(full === undefined ? {} : { full })}
        sendMagicLink={async () => ({ status: 'idle' })}
        startGoogle={async () => ({ status: 'idle' })}
      />,
    )

  it('sin sesión y con cupo dice "Voy"', () => {
    gate()
    expect(screen.getByRole('button', { name: 'Voy' })).toBeTruthy()
  })

  it('sin sesión y con el partido lleno dice "Voy al banco"', () => {
    gate(true)
    expect(screen.getByRole('button', { name: 'Voy al banco' })).toBeTruthy()
  })
})
