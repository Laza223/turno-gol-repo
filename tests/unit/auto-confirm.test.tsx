// @vitest-environment happy-dom
//
// La confirmación sola en el cliente: UN solo envío del form de confirmar, aunque React monte dos
// veces (StrictMode), la pantalla se recargue o se vuelva con Atrás; y el vínculo sale de la URL
// ANTES de enviar. Si JS no corre, queda el botón: degradación natural.
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import AutoConfirm from '@/app/(public)/[slug]/reservar/components/AutoConfirm'

const TURN = { slug: 'club-x', court: 'cancha-1', date: '2099-01-02', time: '21:00' }

let submit: ReturnType<typeof vi.spyOn>
let replaceState: ReturnType<typeof vi.spyOn>
const realLocation = Object.getOwnPropertyDescriptor(window, 'location')

beforeEach(() => {
  window.sessionStorage.clear()
  // La URL se fija a mano y `replaceState` se espía: otros archivos del mismo worker (singleThread
  // comparte el window) dejan `window.location` reemplazado, y esto no puede depender de eso.
  Object.defineProperty(window, 'location', {
    value: new URL('http://localhost/club-x/reservar?court=c1&booking_intent=tok.sig&utm=ig'),
    writable: true,
    configurable: true,
  })
  replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
  submit = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  submit.mockRestore()
  replaceState.mockRestore()
  if (realLocation) Object.defineProperty(window, 'location', realLocation)
})

const inForm = (turn = TURN, onConfirming?: () => void) => (
  <form>
    <AutoConfirm {...turn} onConfirming={onConfirming} />
    <button type="submit">Confirmar reserva</button>
  </form>
)

describe('AutoConfirm', () => {
  it('envía el form una sola vez, aunque StrictMode monte dos veces', () => {
    render(<StrictMode>{inForm()}</StrictMode>)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('mientras confirma lo dice con un status corto, y el botón sigue ahí', () => {
    render(inForm())
    expect(screen.getByRole('status').textContent).toBe('Confirmando tu reserva…')
    expect(screen.getByRole('button', { name: 'Confirmar reserva' })).toBeTruthy()
  })

  it('desde el servidor el status ya está, VACÍO y con su alto reservado: sin JS no hay un "Confirmando…" eterno', () => {
    const html = renderToString(inForm())

    expect(html).toContain('role="status"')
    expect(html).not.toContain('Confirmando')
    // El alto de una línea de 16 px (1,5 rem) ya está reservado: el texto llega sin mover el botón.
    expect(/<p[^>]*role="status"[^>]*class="[^"]*\bmin-h-6\b/.test(html)).toBe(true)
  })

  it('el texto llega DESPUÉS de montar, en el mismo nodo (para que el lector de pantalla anuncie el cambio)', () => {
    const before = renderToString(inForm())
    expect(before).not.toContain('Confirmando')

    let textAtSubmit: string | null = null
    submit.mockImplementation(() => {
      textAtSubmit = screen.getByRole('status').textContent
    })
    render(inForm())

    // Al enviar, el status ya existía y todavía estaba vacío; el texto se pinta después, en el mismo nodo.
    expect(textAtSubmit).toBe('')
    expect(screen.getByRole('status').textContent).toBe('Confirmando tu reserva…')
  })

  it('avisa que confirma UNA vez, antes de enviar (el selector de pago se bloquea)', () => {
    const onConfirming = vi.fn()
    render(<StrictMode>{inForm(TURN, onConfirming)}</StrictMode>)

    expect(onConfirming).toHaveBeenCalledTimes(1)
    expect(onConfirming.mock.invocationCallOrder[0]).toBeLessThan(
      submit.mock.invocationCallOrder[0]!,
    )
  })

  it('una recarga (la clave del turno ya está en sessionStorage) no reenvía ni dice que confirma', () => {
    const onConfirming = vi.fn()
    const first = render(<StrictMode>{inForm()}</StrictMode>)
    expect(submit).toHaveBeenCalledTimes(1)
    first.unmount()

    render(<StrictMode>{inForm(TURN, onConfirming)}</StrictMode>)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(onConfirming).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.getByRole('button', { name: 'Confirmar reserva' })).toBeTruthy()
  })

  it('otro turno es otra clave: sí envía; el mismo turno no reenvía', () => {
    const turns = [
      TURN,
      // Mismo complejo y mismo día, otra hora; otra cancha; otro día.
      { ...TURN, time: '22:00' },
      { ...TURN, court: 'cancha-2' },
      { ...TURN, date: '2099-01-03' },
    ]
    for (const turn of turns) {
      render(inForm(turn))
      cleanup()
    }
    expect(submit).toHaveBeenCalledTimes(4)

    // Ya fueron los cuatro: ninguno vuelve a enviar.
    for (const turn of turns) {
      render(inForm(turn))
      cleanup()
    }
    expect(submit).toHaveBeenCalledTimes(4)
  })

  it('la clave sale de los campos del turno', () => {
    render(inForm())
    const keys = Object.keys(window.sessionStorage)
    expect(keys).toHaveLength(1)
    expect(keys[0]).toContain(TURN.slug)
    expect(keys[0]).toContain(TURN.court)
    expect(keys[0]).toContain(TURN.date)
    expect(keys[0]).toContain(TURN.time)
  })

  it('saca booking_intent de la URL ANTES de enviar, y conserva el resto', () => {
    render(inForm())
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenCalledWith(null, '', '/club-x/reservar?court=c1&utm=ig')
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(
      submit.mock.invocationCallOrder[0]!,
    )
  })

  it('la recarga (clave ya guardada) tampoco toca la URL', () => {
    const first = render(inForm())
    first.unmount()
    replaceState.mockClear()
    render(inForm())
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('sin sessionStorage (modo privado) igual envía una sola vez: queda el guard del ref', () => {
    const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage')!
    const denied = vi.fn(() => {
      throw new Error('SecurityError')
    })
    Object.defineProperty(window, 'sessionStorage', {
      value: { getItem: denied, setItem: denied },
      configurable: true,
    })
    try {
      render(<StrictMode>{inForm()}</StrictMode>)
      // El storage se intentó usar y falló; aun así StrictMode no duplica el envío.
      expect(denied).toHaveBeenCalled()
      expect(submit).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'sessionStorage', real)
    }
  })

  it('fuera de un form no hay nada que enviar y no rompe', () => {
    const onConfirming = vi.fn()
    render(<AutoConfirm {...TURN} onConfirming={onConfirming} />)
    expect(submit).not.toHaveBeenCalled()
    expect(onConfirming).not.toHaveBeenCalled()
  })
})
