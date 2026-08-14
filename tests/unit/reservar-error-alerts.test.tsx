// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  CheckoutErrorBanner,
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
const CODES: CheckoutErrorCode[] = ['banned', 'too_many_holds', 'rate_limited', 'unavailable']

afterEach(() => cleanup())

describe('CheckoutErrorBanner — alertas de error de checkout (#22)', () => {
  it.each(CODES)('renderiza un role="alert" con texto para error=%s', (code) => {
    render(<CheckoutErrorBanner slug="club-norte" error={code} />)
    expect(screen.getByRole('alert').textContent?.trim().length).toBeGreaterThan(0)
  })

  // MEJORA-UX QA: los 4 banners eran solo texto, sin salida — a diferencia de
  // `CheckoutInvalidState`, que siempre ofrece "Elegir otro turno".
  it.each(CODES)(
    'ofrece "Elegir otro turno" hacia el perfil del complejo para error=%s',
    (code) => {
      render(<CheckoutErrorBanner slug="club-norte" error={code} />)
      const link = screen.getByRole('link', { name: 'Elegir otro turno' })
      expect(link).toHaveAttribute('href', '/club-norte')
    },
  )

  it('no renderiza nada sin error', () => {
    render(<CheckoutErrorBanner slug="club-norte" error={undefined} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('no renderiza nada ante un código desconocido', () => {
    render(<CheckoutErrorBanner slug="club-norte" error="ni_idea" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('error=banned con `until` dice cuándo se levanta el softban', () => {
    render(
      <CheckoutErrorBanner slug="club-norte" error="banned" until="2026-03-28T12:00:00.000Z" />,
    )
    expect(screen.getByRole('alert').textContent).toContain('28 mar')
  })

  it('error=banned sin `until` cae al mensaje genérico', () => {
    render(<CheckoutErrorBanner slug="club-norte" error="banned" />)
    expect(screen.getByRole('alert').textContent).toContain('No podés reservar')
  })

  /**
   * ENS-10: el mensaje hardcodeaba "por ausencias" sin importar la causa real
   * del ban (softban automático, ban manual, ban global). Ahora muestra el
   * `reason` real que ya calcula `checkPlayerBanned`/`PlayerBannedError`.
   */
  it('error=banned con `reason` muestra el motivo real, no "por ausencias" hardcodeado', () => {
    render(
      <CheckoutErrorBanner
        slug="club-norte"
        error="banned"
        reason="Ausencias reiteradas (2+ en 90 días)"
        until="2026-03-28T12:00:00.000Z"
      />,
    )
    const text = screen.getByRole('alert').textContent
    expect(text).toContain('Ausencias reiteradas (2+ en 90 días)')
    expect(text).toContain('28 mar')
    expect(text).not.toContain('por ausencias')
  })

  it('error=banned con `reason` de ban global (sin `until`) igual muestra el motivo', () => {
    render(
      <CheckoutErrorBanner
        slug="club-norte"
        error="banned"
        reason="Jugador suspendido globalmente."
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('Jugador suspendido globalmente.')
  })
})
