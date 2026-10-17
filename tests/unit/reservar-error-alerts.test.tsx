// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  CheckoutErrorBanner,
  CheckoutInvalidState,
  type CheckoutErrorCode,
} from '@/app/(public)/[slug]/reservar/CheckoutStates'

/**
 * Contrato (#22): cada código de `?error=` con el que `createBookingAndCheckout`
 * puede redirigir de vuelta al checkout tiene que renderizar un `role="alert"` con
 * texto, para que el jugador entienda por qué no se procesó la reserva.
 *
 * Antes esto era un guard estructural que leía el TEXTO de `reservar/page.tsx` con
 * readFileSync y buscaba el string literal `searchParams.error === 'slot_taken'`.
 * Era frágil (cualquier refactor que no cambiara el comportamiento lo rompía) y no
 * probaba gran cosa: un `role="alert"` vacío o mal puesto igual pasaba. Ahora que el
 * banner vive en su propio componente (CheckoutStates.tsx, extraído del page para
 * poder storyearlo) se puede renderizar de verdad y asertar lo que el jugador VE.
 */
// `slot_taken` salió del union el 2026-08-14 (decisión del dueño): el guard de
// disponibilidad de reservar/page.tsx cubre ese caso antes del banner, así que el
// código dejó de emitirse. La REGLA no cambió — sigue siendo "todo código con el
// que el checkout puede rebotar tiene que renderizar un alert con texto".
const CODES: CheckoutErrorCode[] = [
  'banned',
  'too_many_holds',
  'rate_limited',
  'unavailable',
  'date_out_of_range',
  'too_soon',
]

afterEach(() => cleanup())

// La ficha con lo que eligió (día, hora y formato): la misma que el "Volver" de la page.
const TURN = '/club-norte?date=2026-03-14&hora=21%3A00&formato=5'

describe('CheckoutErrorBanner — alertas de error de checkout (#22)', () => {
  it.each(CODES)('renderiza un role="alert" con texto para error=%s', (code) => {
    render(<CheckoutErrorBanner turnHref={TURN} error={code} />)
    expect(screen.getByRole('alert').textContent?.trim().length).toBeGreaterThan(0)
  })

  // MEJORA-UX QA: los banners eran solo texto, sin salida. Cada aviso dice qué hacer y lleva ahí:
  // a la ficha con el día, la hora y el formato que eligió (a esa hora puede haber otra cancha libre);
  // el bloqueado, a otro complejo (otro turno daría el mismo error).
  const OTRO_TURNO = CODES.filter((code) => code !== 'banned')

  it.each(OTRO_TURNO)(
    '"Elegir otro turno" conserva el día, la hora y el formato para error=%s',
    (code) => {
      render(<CheckoutErrorBanner turnHref={TURN} error={code} />)
      expect(screen.getByRole('link', { name: 'Elegir otro turno' })).toHaveAttribute('href', TURN)
    },
  )

  it('error=banned ofrece buscar otro complejo, no otro turno de este', () => {
    render(<CheckoutErrorBanner turnHref={TURN} error="banned" />)
    expect(screen.getByRole('link', { name: 'Buscar otro complejo' })).toHaveAttribute(
      'href',
      '/explorar',
    )
    expect(screen.queryByRole('link', { name: 'Elegir otro turno' })).toBeNull()
  })

  it('cada pantalla inválida dice qué pasó y a dónde seguir; las del turno llevan a la misma ficha que el Volver', () => {
    const cases = [
      ['no-online', /no toma reservas online/, 'Ver el complejo', '/club-norte'],
      ['missing', /No pudimos abrir este turno/, 'Elegir un turno', '/club-norte'],
      ['not-found', /No encontramos ese turno/, 'Elegir otro turno', TURN],
      ['taken', /Ese turno ya no está disponible/, 'Elegir otro turno', TURN],
    ] as const
    for (const [kind, title, cta, href] of cases) {
      const { unmount } = render(
        <CheckoutInvalidState slug="club-norte" kind={kind} turnHref={TURN} />,
      )
      expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(title)
      expect(screen.getByRole('link', { name: cta })).toHaveAttribute('href', href)
      unmount()
    }
  })

  // El ámbar es de la escasez ("Queda 1") y de nada más: un aviso que frena la reserva es un error.
  it.each(CODES)('error=%s: el aviso no usa ámbar (es un error, no una advertencia)', (code) => {
    const { container } = render(<CheckoutErrorBanner turnHref={TURN} error={code} />)
    expect(container.innerHTML).not.toMatch(/amber|yellow|orange/)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('text-red-700')
  })

  it('los links de salida llevan el anillo de foco del mundo, no el contorno del navegador', () => {
    render(<CheckoutErrorBanner turnHref={TURN} error="unavailable" />)
    const link = screen.getByRole('link', { name: 'Elegir otro turno' })
    expect(link.className).toContain('focus-visible:ring-2')
    expect(link.className).toContain('focus-visible:outline-hidden')
  })

  it('las pantallas inválidas no usan ámbar en su ícono', () => {
    for (const kind of ['no-online', 'missing', 'not-found', 'taken'] as const) {
      const { container, unmount } = render(<CheckoutInvalidState slug="club-norte" kind={kind} />)
      expect(container.innerHTML).not.toMatch(/amber|yellow|orange/)
      unmount()
    }
  })

  it('no renderiza nada sin error', () => {
    render(<CheckoutErrorBanner turnHref={TURN} error={undefined} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('no renderiza nada ante un código desconocido', () => {
    render(<CheckoutErrorBanner turnHref={TURN} error="ni_idea" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('error=banned con `until` dice hasta cuándo no puede reservar en el complejo', () => {
    render(<CheckoutErrorBanner turnHref={TURN} error="banned" until="2026-03-28T12:00:00.000Z" />)
    expect(screen.getByRole('alert').textContent).toContain(
      'No podés reservar en este complejo hasta el 28 mar',
    )
  })

  it('error=banned sin `until` ni motivo: el bloqueo es del complejo, no de TurnoGol', () => {
    render(<CheckoutErrorBanner turnHref={TURN} error="banned" />)
    const text = screen.getByRole('alert').textContent
    expect(text).toContain('No podés reservar en este complejo.')
    expect(text).not.toContain('Motivo')
    expect(text).not.toContain('Te bloqueamos')
  })

  /**
   * ENS-10: el mensaje hardcodeaba "por ausencias" sin importar la causa real
   * del ban (softban automático, ban manual, ban global). Ahora muestra el
   * `reason` real que ya calcula `checkPlayerBanned`/`PlayerBannedError`.
   */
  it('error=banned con `reason` muestra el motivo real, no "por ausencias" hardcodeado', () => {
    render(
      <CheckoutErrorBanner
        turnHref={TURN}
        error="banned"
        reason="Ausencias reiteradas (2+ en 90 días)"
        until="2026-03-28T12:00:00.000Z"
      />,
    )
    const text = screen.getByRole('alert').textContent
    expect(text).toContain('Motivo: Ausencias reiteradas (2+ en 90 días).')
    expect(text).toContain('hasta el 28 mar')
    expect(text).not.toContain('por ausencias')
  })

  it('error=banned con `reason` de ban global (sin `until`) igual muestra el motivo', () => {
    render(
      <CheckoutErrorBanner
        turnHref={TURN}
        error="banned"
        reason="Jugador suspendido globalmente."
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'No podés reservar en este complejo. Motivo: Jugador suspendido globalmente.',
    )
  })
})
