// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import CourtRows from '@/app/(public)/[slug]/components/CourtRows'
import type { HourRow } from '@/lib/booking/hour-summary'

// El link de cada cancha lleva a confirmar y, si la ficha tenía un filtro de formato, lo lleva
// consigo: es lo que hace que el "Volver" de confirmar deje la ficha como estaba.

afterEach(() => cleanup())

const tenant = {
  slug: 'club-x',
  allowOnlineBooking: true,
  hidePrices: false,
  phone: '+541100000000',
  whatsapp: null,
}
const row: HourRow = {
  time: '21:00',
  freeCount: 2,
  state: 'free',
  courts: [
    { id: 'c1', name: 'Cancha 1', format: 7, price: 1_500_000 },
    { id: 'c2', name: 'Cancha 2', format: 7, price: 1_800_000 },
  ],
}

const hrefs = () => screen.getAllByRole('link').map((a) => a.getAttribute('href')!)

describe('CourtRows — el formato viaja al link de reservar', () => {
  it('con un formato elegido, cada link a confirmar lo lleva', () => {
    render(<CourtRows tenant={tenant} row={row} date="2026-03-14" formato={7} />)
    expect(hrefs()).toEqual([
      '/club-x/reservar?court=c1&date=2026-03-14&time=21:00&dur=60&formato=7',
      '/club-x/reservar?court=c2&date=2026-03-14&time=21:00&dur=60&formato=7',
    ])
  })

  it.each([
    ['"Todos" (null)', { formato: null }],
    ['sin la prop', {}],
  ])('con %s los links no llevan `formato`', (_name, extra) => {
    render(<CourtRows tenant={tenant} row={row} date="2026-03-14" {...extra} />)
    for (const href of hrefs()) {
      expect(href).toMatch(/^\/club-x\/reservar\?court=c\d&date=2026-03-14&time=21:00&dur=60$/)
      expect(href).not.toContain('formato')
    }
  })
})
