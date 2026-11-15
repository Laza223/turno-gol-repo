// @vitest-environment happy-dom
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import CelebrateOnce from '@/components/booking/CelebrateOnce'
import { CELEBRATED_COOKIE } from '@/lib/booking/celebrate'

const ID = '11111111-2222-4333-8444-555555555555'

function media({ coarse = false, reduce = false } = {}) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: (q.includes('pointer: coarse') && coarse) || (q.includes('reduce') && reduce),
  }))
}

/**
 * Un jar de cookies propio: el `path=/reserva` de la marca depende de la URL de happy-dom, que no es
 * la misma en todos los entornos. Lo que importa acá es qué escribe el componente y qué lee.
 */
let jar = new Map<string, string>()
function installJar() {
  jar = new Map()
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    set: (raw: string) => {
      const [pair] = raw.split(';')
      const eq = pair.indexOf('=')
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1))
    },
  })
}

const box = (container: HTMLElement) => container.firstElementChild as HTMLElement

describe('CelebrateOnce: festeja una vez por visita', () => {
  let vibrate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    installJar()
    vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
  })
  afterEach(() => {
    cleanup()
    // Vuelve el `document.cookie` de happy-dom (el del prototipo).
    Reflect.deleteProperty(document, 'cookie')
    vi.unstubAllGlobals()
  })

  it('la primera vez festeja (sin data-seen) y deja la marca de esa reserva', () => {
    media()
    const { container } = render(<CelebrateOnce bookingId={ID}>x</CelebrateOnce>)
    expect(box(container).hasAttribute('data-seen')).toBe(false)
    expect(document.cookie).toContain(`${CELEBRATED_COOKIE}=${ID}`)
  })

  it('StrictMode (doble montaje en dev) no apaga el festejo de la primera visita', () => {
    media()
    const { container } = render(
      <StrictMode>
        <CelebrateOnce bookingId={ID}>x</CelebrateOnce>
      </StrictMode>,
    )
    expect(box(container).hasAttribute('data-seen')).toBe(false)
  })

  it('volver a la misma reserva sin recargar: queda quieta', () => {
    media()
    document.cookie = `${CELEBRATED_COOKIE}=${ID}`
    const { container } = render(<CelebrateOnce bookingId={ID}>x</CelebrateOnce>)
    expect(box(container).hasAttribute('data-seen')).toBe(true)
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('otra reserva festeja aunque haya marca de una anterior', () => {
    media()
    document.cookie = `${CELEBRATED_COOKIE}=otra`
    const { container } = render(<CelebrateOnce bookingId={ID}>x</CelebrateOnce>)
    expect(box(container).hasAttribute('data-seen')).toBe(false)
  })

  it('al recargar el servidor manda seen: data-seen sale en el primer render', () => {
    media()
    const { container } = render(
      <CelebrateOnce bookingId={ID} seen>
        x
      </CelebrateOnce>,
    )
    expect(box(container).hasAttribute('data-seen')).toBe(true)
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('vibra solo en un celular sin "reducir movimiento"', () => {
    media({ coarse: true })
    render(<CelebrateOnce bookingId={ID}>x</CelebrateOnce>)
    expect(vibrate).toHaveBeenCalledWith([12, 70, 12])
  })

  it('con "reducir movimiento" no vibra', () => {
    media({ coarse: true, reduce: true })
    render(<CelebrateOnce bookingId={ID}>x</CelebrateOnce>)
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('con mouse no vibra', () => {
    media()
    render(<CelebrateOnce bookingId={ID}>x</CelebrateOnce>)
    expect(vibrate).not.toHaveBeenCalled()
  })
})
