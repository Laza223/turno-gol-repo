// @vitest-environment happy-dom
//
// El aviso que reemplaza a "Continuar con Google" en el navegador interno de una app. Quién lo
// muestra y en qué orden lo cubren ingresar-page, login-gate y reservar-page-render.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InAppBrowserNotice } from '@/components/world/InAppBrowserNotice'

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const realLocation = Object.getOwnPropertyDescriptor(window, 'location')
const PAGE = 'http://localhost/complejo-fenix/reservar?court=c1&date=2026-10-22'

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

beforeEach(() => {
  // La URL se fija a mano: otros archivos del mismo worker (singleThread comparte el window) dejan
  // `window.location` reemplazado, y en CI llegaba `about:blank`.
  Object.defineProperty(window, 'location', {
    value: new URL(PAGE),
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else Reflect.deleteProperty(navigator, 'clipboard')
  if (realLocation) Object.defineProperty(window, 'location', realLocation)
})

const copy = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))
  })
}

describe('InAppBrowserNotice', () => {
  it('dice por qué no hay Google y las dos salidas, sin nada anunciado todavía', () => {
    render(<InAppBrowserNotice />)
    expect(screen.getByText('¿Querés entrar con Google?')).toBeTruthy()
    expect(screen.getByText(/No funciona dentro de esta app\./).textContent).toBe(
      'No funciona dentro de esta app. Tocá los tres puntos arriba a la derecha y elegí abrir en el navegador. O copiá el enlace y pegalo en Chrome o Safari.',
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('copia la página tal cual (con el turno elegido) y avisa dónde pegarla', async () => {
    const writeText = vi.fn(async () => {})
    setClipboard({ writeText })
    render(<InAppBrowserNotice />)

    await copy()

    expect(writeText).toHaveBeenCalledWith(PAGE)
    expect(screen.getByRole('status').textContent).toBe(
      'Enlace copiado. Pegalo en Chrome o Safari.',
    )
  })

  it('si el navegador de la app rechaza copiar, manda al menú de los tres puntos', async () => {
    setClipboard({ writeText: vi.fn(async () => Promise.reject(new Error('NotAllowedError'))) })
    render(<InAppBrowserNotice />)

    await copy()

    expect(screen.getByRole('status').textContent).toBe(
      'No se pudo copiar. Usá los tres puntos de arriba a la derecha.',
    )
  })

  it('sin portapapeles (WebView viejo) también manda al menú, sin romper', async () => {
    setClipboard(undefined)
    render(<InAppBrowserNotice />)

    await copy()

    expect(screen.getByRole('status').textContent).toBe(
      'No se pudo copiar. Usá los tres puntos de arriba a la derecha.',
    )
  })
})
