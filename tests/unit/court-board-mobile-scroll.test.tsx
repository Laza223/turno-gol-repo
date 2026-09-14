// @vitest-environment happy-dom
/**
 * Hallazgo #2 (revisión redesign booking modal, 2026-09-14): debajo de `lg`,
 * CSS grid con `align-items: stretch` (el default) forzaba cada columna a la
 * altura de la fila y `overflow-hidden` en la `section` recortaba las tarjetas
 * que sobraban — medido: `section.offsetHeight` 608 / `scrollHeight` 1491 a
 * 375×812, últimas tarjetas inalcanzables con cualquier scroll. El contrato
 * documentado en el propio JSDoc de `CourtBoard` ("< lg: alto natural, la
 * página entera scrollea") nunca se cumplía en el CSS.
 *
 * happy-dom no calcula layout real (offsetHeight/scrollHeight dan 0 siempre),
 * así que el guard barato es el CONTRATO DE CLASES: el grid tiene que arrancar
 * en `items-start` (alto natural por columna) y sólo pasar a `items-stretch`
 * en `lg`, y la `section` de cada cancha NO puede clipear (`overflow-hidden`)
 * salvo también a partir de `lg` (ahí sí, para el scroll independiente).
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { uid } from '@/test/fixtures/ids'
import { CourtBoard } from '@/app/(admin)/reservas/CourtBoard'

const ACTIONS = {
  cancelBookingAction: async () => ({ success: true as const, booking: {} as never }),
  completeAndChargeBookingAction: async () => ({ success: true as const, booking: {} as never }),
  confirmDepositPaymentAction: async () => ({ success: true as const, booking: {} as never }),
  markNoShowAction: async () => ({ success: true as const, booking: {} as never }),
}

const COURT = { id: uid(1), name: 'Cancha 1' }

describe('CourtBoard — contrato de clases para no clipear en mobile', () => {
  it('el grid arranca en items-start (alto natural) y sólo estira en lg', () => {
    const { container } = render(
      <CourtBoard courts={[COURT]} bookings={[]} scope="hoy" actions={ACTIONS} />,
    )
    const grid = container.querySelector('[class*="grid-flow-col"]')
    expect(grid?.className).toMatch(/(^|\s)items-start(\s|$)/)
    expect(grid?.className).toMatch(/lg:items-stretch/)
  })

  it('la section de cada cancha NO clipea contenido debajo de lg — sólo lg:overflow-hidden', () => {
    render(<CourtBoard courts={[COURT]} bookings={[]} scope="hoy" actions={ACTIONS} />)
    const section = screen.getByRole('region', { name: COURT.name })
    expect(section.className).not.toMatch(/(^|\s)overflow-hidden(\s|$)/)
    expect(section.className).toMatch(/lg:overflow-hidden/)
  })
})
