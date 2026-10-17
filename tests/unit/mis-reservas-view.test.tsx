// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import {
  MisReservasView,
  type MisReservasBookingRow,
} from '@/app/(player)/mis-reservas/MisReservasView'

/**
 * La proyección de la query de /mis-reservas ya cocinada por la page (`ended`, `share_href`,
 * `price_snapshot: null` con precios ocultos…). Acá se mira lo que la vista hace con ella.
 */
const TODAY = '2026-03-14'

const row = (overrides: Partial<MisReservasBookingRow> = {}): MisReservasBookingRow => {
  const date = overrides.date ?? '2026-03-16'
  return {
    id: 'b-1',
    date,
    starts_on: date,
    time_start: '20:00:00',
    time_end: '21:00:00',
    type: 'spontaneous',
    status: 'confirmed',
    price_snapshot: 1500000,
    court_name: 'Cancha 2',
    court_format: 7,
    tenant_name: 'Complejo Demo',
    tenant_slug: 'complejo-demo',
    address: 'Av. Siempreviva 742, Rosario',
    directions_href: 'https://www.google.com/maps/search/?api=1&query=x',
    share_href: 'https://wa.me/?text=hola',
    ended: false,
    canceled_by: null,
    has_review: false,
    cancellation_outcome: 'no_deposit',
    deposit_amount: 0,
    deposit_status: 'not_required',
    ...overrides,
  }
}

function renderView(
  bookings: MisReservasBookingRow[],
  props: { tab?: 'proximos' | 'historial'; page?: number } = {},
) {
  return render(
    <MisReservasView
      bookings={bookings}
      tab={props.tab ?? 'proximos'}
      today={TODAY}
      upcomingCount={bookings.length}
      cancelAction={async () => ({ success: false, error: 'x' })}
      page={props.page ?? 0}
      total={bookings.length}
      pageSize={20}
    />,
  )
}

const card = (id: string) => document.getElementById(`reserva-${id}-cuando`)!.closest('li')!

afterEach(cleanup)

describe('MisReservasView — pestañas', () => {
  it('son un <nav> con nombre y la activa lleva aria-current="page"', () => {
    renderView([row()], { tab: 'historial' })
    const nav = screen.getByRole('navigation', { name: 'Tus reservas' })
    expect(within(nav).getByRole('link', { name: 'Historial' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Próximos' })).not.toHaveAttribute('aria-current')
    expect(within(nav).getByRole('link', { name: 'Historial' })).toHaveAttribute(
      'href',
      '/mis-reservas?tab=historial',
    )
  })
})

describe('MisReservasView — la próxima, primero y completa', () => {
  it('la primera de Próximos trae día, hora, cancha con formato, dirección, grupo y cómo llegar', () => {
    renderView([row({ id: 'a', date: TODAY }), row({ id: 'b' })])
    const first = within(card('a'))
    expect(first.getByText('Hoy')).toBeInTheDocument()
    expect(first.getByText('20:00 a 21:00')).toBeInTheDocument()
    expect(first.getByText(/Cancha 2 · Fútbol 7/)).toBeInTheDocument()
    expect(first.getByText('Av. Siempreviva 742, Rosario')).toBeInTheDocument()
    expect(first.getByRole('link', { name: 'Avisarle al grupo' })).toHaveAttribute(
      'href',
      'https://wa.me/?text=hola',
    )
    expect(first.getByRole('link', { name: 'Cómo llegar' })).toBeInTheDocument()
  })

  it('el resto de las tarjetas va compacto: sin dirección, grupo ni cómo llegar', () => {
    renderView([row({ id: 'a' }), row({ id: 'b' })])
    const second = within(card('b'))
    expect(second.queryByText('Av. Siempreviva 742, Rosario')).toBeNull()
    expect(second.queryByRole('link', { name: 'Avisarle al grupo' })).toBeNull()
    expect(second.queryByRole('link', { name: 'Cómo llegar' })).toBeNull()
  })

  it('en la página 2 o en Historial ninguna es "la próxima"', () => {
    renderView([row({ id: 'a' })], { page: 1 })
    expect(screen.queryByRole('link', { name: 'Avisarle al grupo' })).toBeNull()
  })

  it('"Mañana" para el día siguiente', () => {
    renderView([row({ id: 'a', date: '2026-03-15' })])
    expect(within(card('a')).getByText('Mañana')).toBeInTheDocument()
  })
})

describe('MisReservasView — cada tarjeta se abre', () => {
  it('la confirmada lleva a /reserva/{id}/exito y no hay nada interactivo adentro de un <a>', () => {
    renderView([row({ id: 'a', deposit_status: 'paid', deposit_amount: 500000 })])
    const link = within(card('a')).getByRole('link', { name: /20:00 a 21:00/ })
    expect(link).toHaveAttribute('href', '/reserva/a/exito')
    expect(link.querySelectorAll('a, button, input, select, textarea, [tabindex]')).toHaveLength(0)
    // Y las acciones siguen ahí, fuera del link.
    expect(within(card('a')).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(link.contains(within(card('a')).getByRole('button', { name: 'Cancelar' }))).toBe(false)
  })

  it('esperando seña no abre nada y explica que el turno se libera', () => {
    renderView([row({ id: 'a', status: 'pending_payment', share_href: null })])
    const c = within(card('a'))
    expect(c.queryByRole('link', { name: /20:00 a 21:00/ })).toBeNull()
    expect(c.getByText(/el turno se libera/)).toBeInTheDocument()
  })

  it('los botones repetidos conservan su nombre exacto y llevan el contexto por descripción', () => {
    renderView([row({ id: 'a' })])
    const cancel = within(card('a')).getByRole('button', { name: 'Cancelar' })
    expect(cancel).toHaveAccessibleDescription(/20:00 a 21:00|Cancha 2/)
  })
})

describe('MisReservasView — seña, pago y precios ocultos', () => {
  it('señada se marca como tal, con el monto de la seña', () => {
    renderView([row({ id: 'a', deposit_status: 'paid', deposit_amount: 500000 })])
    expect(within(card('a')).getByText(/Señada, \$\s5\.000/)).toBeInTheDocument()
    expect(within(card('a')).queryByText(/Pagás en el complejo/)).toBeNull()
  })

  it('sin seña dice "Pagás en el complejo"', () => {
    renderView([row({ id: 'a' })])
    expect(within(card('a')).getByText(/Pagás en el complejo/)).toBeInTheDocument()
  })

  it('con precios visibles muestra el monto del turno', () => {
    renderView([row({ id: 'a' })])
    expect(within(card('a')).getByText(/Turno \$\s15\.000/)).toBeInTheDocument()
  })

  it('con precios ocultos no hay ningún monto del turno en el DOM ni en un aria-label, pero la seña propia sí', () => {
    const { container } = renderView([
      row({ id: 'a', price_snapshot: null, deposit_status: 'paid', deposit_amount: 500000 }),
      row({
        id: 'b',
        price_snapshot: null,
        status: 'canceled_refunded',
        canceled_by: 'player',
        deposit_status: 'refunded',
        deposit_amount: 500000,
        refund: {
          amountCents: 500000,
          state: 'pending',
          settledMethod: null,
          settledAt: null,
          bookingCode: 'ABC123',
          dateLabel: '16/03',
          timeLabel: '20:00',
          tenantName: 'Complejo Demo',
          tenantWhatsapp: null,
          tenantPhone: '3415550000',
          tenantEmail: 'hola@demo.test',
        },
      }),
    ])
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/15\.000/)
    expect(text).not.toMatch(/Turno \$/)
    for (const el of container.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label')).not.toMatch(/\$/)
    }
    // La seña propia y la devolución siguen a la vista.
    expect(within(card('a')).getByText(/Señada, \$\s5\.000/)).toBeInTheDocument()
    expect(within(card('b')).getByText('Devolución pendiente')).toBeInTheDocument()
    expect(within(card('b')).getByText(/\$\s5\.000/)).toBeInTheDocument()
  })
})

describe('MisReservasView — estados que dicen qué pasó', () => {
  it('cancelada dice quién la canceló sin repetir la palabra del badge', () => {
    renderView(
      [
        row({ id: 'a', status: 'canceled_refunded', canceled_by: 'player' }),
        row({ id: 'b', status: 'canceled_no_refund', canceled_by: 'admin' }),
      ],
      { tab: 'historial' },
    )
    expect(within(card('a')).getByText('La cancelaste vos.')).toBeInTheDocument()
    expect(within(card('b')).getByText('La canceló el complejo.')).toBeInTheDocument()
    // El badge sigue siendo el único nodo "Cancelada" (strict mode de los e2e).
    expect(within(card('a')).getAllByText('Cancelada')).toHaveLength(1)
    expect(within(card('a')).getAllByText(/cancelada/i)).toHaveLength(1)
  })

  it('ausente se explica, sin rojo de alarma', () => {
    renderView([row({ id: 'a', status: 'no_show' })], { tab: 'historial' })
    const c = within(card('a'))
    expect(c.getByText(/No te presentaste a este turno/)).toBeInTheDocument()
    const badge = c.getByText('Ausente').closest('span')!
    expect(badge.className).not.toMatch(/red|destructive/)
  })

  it('expirada dice que no se pagó a tiempo', () => {
    renderView([row({ id: 'a', status: 'expired' })], { tab: 'historial' })
    expect(within(card('a')).getByText(/No se pagó la seña a tiempo/)).toBeInTheDocument()
  })

  it('"Reservar de nuevo" lleva a la ficha en ese día y formato, en jugadas, canceladas, expiradas y ausentes', () => {
    const statuses = ['completed', 'canceled_refunded', 'canceled_no_refund', 'expired', 'no_show']
    renderView(
      statuses.map((status, i) =>
        row({ id: `s${i}`, status, date: '2026-03-10', court_format: 5, has_review: true }),
      ),
      { tab: 'historial' },
    )
    statuses.forEach((_, i) => {
      expect(
        within(card(`s${i}`)).getByRole('link', { name: 'Reservar de nuevo' }),
      ).toHaveAttribute('href', '/complejo-demo?date=2026-03-10&formato=5')
    })
  })

  it('una confirmada no ofrece "Reservar de nuevo"', () => {
    renderView([row({ id: 'a' })])
    expect(screen.queryByRole('link', { name: 'Reservar de nuevo' })).toBeNull()
  })
})

describe('MisReservasView — turno de hoy ya terminado', () => {
  it('no ofrece "Cancelar" y avisa que terminó', () => {
    renderView([row({ id: 'a', date: TODAY, ended: true })])
    expect(within(card('a')).queryByRole('button', { name: 'Cancelar' })).toBeNull()
    expect(within(card('a')).getByText('Este turno ya terminó.')).toBeInTheDocument()
  })

  it('el que todavía no terminó sí', () => {
    renderView([row({ id: 'a', date: TODAY, ended: false })])
    expect(within(card('a')).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })
})

describe('MisReservasView — la próxima de verdad (ronda 2)', () => {
  it('un turno de hoy ya terminado no es "la próxima": lo es el siguiente que se juega', () => {
    renderView([
      row({ id: 'viejo', date: TODAY, ended: true, share_href: null }),
      row({ id: 'futuro', date: '2026-03-16' }),
    ])
    expect(within(card('futuro')).getByRole('link', { name: 'Avisarle al grupo' })).toBeVisible()
    expect(within(card('viejo')).queryByRole('link', { name: 'Avisarle al grupo' })).toBeNull()
    expect(within(card('viejo')).queryByText('Av. Siempreviva 742, Rosario')).toBeNull()
  })

  it('una esperando seña tampoco es la próxima, aunque vaya primera', () => {
    renderView([
      row({ id: 'pend', status: 'pending_payment', share_href: null }),
      row({ id: 'conf', date: '2026-03-17' }),
    ])
    expect(within(card('conf')).getByRole('link', { name: 'Cómo llegar' })).toBeVisible()
    expect(within(card('pend')).queryByRole('link', { name: 'Cómo llegar' })).toBeNull()
  })
})

describe('MisReservasView — cómo se lee el turno (ronda 2)', () => {
  it('el rango va con "a", no con raya, y la fecha sin coma', () => {
    renderView([row({ id: 'a', date: '2026-03-20' })])
    const c = within(card('a'))
    expect(c.getByText('20:00 a 21:00')).toBeInTheDocument()
    expect(c.queryByText(/–/)).toBeNull()
    expect(c.getByText('vie 20 mar')).toBeInTheDocument()
  })

  it('cada monto va en un fragmento que no se parte', () => {
    renderView([row({ id: 'a', deposit_status: 'paid', deposit_amount: 500000 })])
    for (const re of [/Señada, \$\s5\.000/, /Turno \$\s15\.000/]) {
      expect(within(card('a')).getByText(re)).toHaveClass('whitespace-nowrap')
    }
  })

  it('"Hoy" y "Mañana" salen del día físico (starts_on), no del día operativo', () => {
    // Complejo que cierra pasada la medianoche: el 00:00 del día operativo de hoy se juega mañana.
    renderView([
      row({
        id: 'a',
        date: TODAY,
        starts_on: '2026-03-15',
        time_start: '00:00',
        time_end: '01:00',
      }),
      row({ id: 'b', date: TODAY, starts_on: TODAY }),
    ])
    expect(within(card('a')).getByText('Mañana')).toBeInTheDocument()
    expect(within(card('b')).getByText('Hoy')).toBeInTheDocument()
  })

  it('el diálogo de cancelar nombra el día físico, no el operativo', async () => {
    renderView([
      row({
        id: 'a',
        date: TODAY,
        starts_on: '2026-03-15',
        time_start: '00:00',
        time_end: '01:00',
      }),
    ])
    fireEvent.click(within(card('a')).getByRole('button', { name: 'Cancelar' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toMatch(/dom 15 mar/)
    expect(dialog.textContent).not.toMatch(/sáb 14 mar/)
  })
})

describe('MisReservasView — acciones livianas y alineadas (ronda 2)', () => {
  it('"Reservar de nuevo" es un link sin borde, de 44 px', () => {
    renderView([row({ id: 'a', status: 'completed', has_review: true })], { tab: 'historial' })
    const link = within(card('a')).getByRole('link', { name: 'Reservar de nuevo' })
    expect(link.className).not.toMatch(/(^|\s)border(\s|$)/)
    expect(link.className).toMatch(/min-h-11/)
  })

  it('las acciones sin borde van marcadas para alinear la primera con el borde de la fila', () => {
    renderView([row({ id: 'a' }), row({ id: 'b', status: 'completed', has_review: false })])
    const cancel = within(card('b')).getByRole('button', { name: 'Dejar reseña' })
    expect(cancel).toHaveAttribute('data-ghost')
    expect(cancel.parentElement!.className).toMatch(/\[&>\[data-ghost\]:first-child\]:-ml-3/)
    // Un botón sin borde después de uno con borde (Cancelar junto a "Cómo llegar") se va a la
    // derecha: si baja de renglón no queda sangrado por su propio relleno.
    expect(cancel.parentElement!.className).toMatch(
      /\[&>:not\(\[data-ghost\]\)~\[data-ghost\]\]:ml-auto/,
    )
    expect(within(card('a')).getByRole('button', { name: 'Cancelar' })).toHaveAttribute(
      'data-ghost',
    )
  })
})
