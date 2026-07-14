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
const CODES: CheckoutErrorCode[] = [
  'slot_taken',
  'banned',
  'too_many_holds',
  'rate_limited',
  'unavailable',
]

afterEach(() => cleanup())

describe('CheckoutErrorBanner — alertas de error de checkout (#22)', () => {
  it.each(CODES)('renderiza un role="alert" con texto para error=%s', (code) => {
    render(<CheckoutErrorBanner error={code} />)
    expect(screen.getByRole('alert').textContent?.trim().length).toBeGreaterThan(0)
  })

  it('no renderiza nada sin error', () => {
    render(<CheckoutErrorBanner error={undefined} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('no renderiza nada ante un código desconocido', () => {
    render(<CheckoutErrorBanner error="ni_idea" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('error=banned con `until` dice cuándo se levanta el softban', () => {
    render(<CheckoutErrorBanner error="banned" until="2026-03-28T12:00:00.000Z" />)
    expect(screen.getByRole('alert').textContent).toContain('28 mar')
  })

  it('error=banned sin `until` cae al mensaje genérico', () => {
    render(<CheckoutErrorBanner error="banned" />)
    expect(screen.getByRole('alert').textContent).toContain('No podés reservar')
  })
})
