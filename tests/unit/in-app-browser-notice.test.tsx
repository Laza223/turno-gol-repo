// @vitest-environment happy-dom
//
// El botón de Google del navegador interno de una app: no inicia el ingreso, le pide al teléfono
// abrir la página en el navegador. Quién lo muestra y en qué orden lo cubren ingresar-page,
// login-gate y reservar-page-render; las URLs de salto, in-app-browser.test.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InAppBrowserNotice } from '@/components/world/InAppBrowserNotice'

const realLocation = Object.getOwnPropertyDescriptor(window, 'location')
const realUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
const PAGE = 'http://localhost/complejo-fenix/reservar?court=c1&date=2026-10-22'

const INSTAGRAM_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 340.0.0.18.109 (iPhone14,5; iOS 17_5; es_AR)'
const INSTAGRAM_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Instagram 340.0.0.30.109 Android (34/14; es_AR)'

const setUserAgent = (value: string) =>
  Object.defineProperty(navigator, 'userAgent', { value, configurable: true })

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
  if (realLocation) Object.defineProperty(window, 'location', realLocation)
  if (realUserAgent) Object.defineProperty(navigator, 'userAgent', realUserAgent)
  else Reflect.deleteProperty(navigator, 'userAgent')
})

const tap = () => fireEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))

describe('InAppBrowserNotice', () => {
  it('en reposo: el botón de Google y por qué abre el navegador, sin nada que copiar', () => {
    render(<InAppBrowserNotice />)
    const button = screen.getByRole('button', { name: 'Continuar con Google' })
    expect(button.getAttribute('aria-describedby')).toBe(
      screen.getByText('Te abrimos tu navegador para que entres con Google.').id,
    )
    expect(screen.queryByText(/Copiar enlace/)).toBeNull()
    expect(window.location.href).toBe(PAGE)
  })

  it('Instagram en iPhone: manda a la página, con el turno elegido, al esquema de Instagram', () => {
    setUserAgent(INSTAGRAM_IPHONE)
    render(<InAppBrowserNotice />)
    tap()
    expect(window.location.href).toBe(`instagram://extbrowser/?url=${encodeURIComponent(PAGE)}`)
  })

  it('Instagram en Android: manda a un intent a la misma página', () => {
    setUserAgent(INSTAGRAM_ANDROID)
    render(<InAppBrowserNotice />)
    tap()
    expect(window.location.href).toMatch(
      /^intent:\/\/localhost\/complejo-fenix\/reservar\?court=c1&date=2026-10-22#Intent;scheme=http;/,
    )
  })

  it('tocado, lo único que ofrece si no se abrió es el email: ni copiar enlace ni el menú de la app', () => {
    setUserAgent(INSTAGRAM_IPHONE)
    render(<InAppBrowserNotice />)
    tap()
    expect(screen.getByText('Si no se abrió tu navegador, entrá con tu email.')).toBeTruthy()
    expect(screen.queryByText('Te abrimos tu navegador para que entres con Google.')).toBeNull()
    expect(screen.queryByRole('button', { name: /copiar/i })).toBeNull()
    expect(screen.queryByText(/tres puntos/)).toBeNull()
  })

  it('con la piel de vidrio (/ingresar) hace lo mismo: el salto sale del mismo botón', () => {
    setUserAgent(INSTAGRAM_IPHONE)
    render(<InAppBrowserNotice glass />)
    tap()
    expect(window.location.href).toBe(`instagram://extbrowser/?url=${encodeURIComponent(PAGE)}`)
    expect(screen.getByText('Si no se abrió tu navegador, entrá con tu email.')).toBeTruthy()
  })

  it('en una plataforma que no reconoce no navega a ningún lado y manda al email', () => {
    setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    )
    render(<InAppBrowserNotice />)
    tap()
    expect(window.location.href).toBe(PAGE)
    expect(screen.getByText('Si no se abrió tu navegador, entrá con tu email.')).toBeTruthy()
  })
})
