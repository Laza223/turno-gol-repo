// @vitest-environment happy-dom
//
// La pantalla de confirmar sin el servidor: resumen + UN botón de acción + política de cancelación.
// Sin sesión el botón abre el ingreso (modal). Lo que importa de esta capa: el `formato` y el `pay`
// de un link viejo viajan (`next` del ingreso, form de confirmar) y con `hidePrices` no hay un monto.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import BookingSummary from '@/app/(public)/[slug]/reservar/components/BookingSummary'
import CheckoutFlow from '@/app/(public)/[slug]/reservar/components/CheckoutFlow'

afterEach(() => cleanup())

const summary = {
  tenantName: 'El Vagón',
  address: 'Av. Siempreviva 742',
  city: 'Moreno',
  courtName: 'Cancha 2',
  courtFormat: 5,
  date: '2026-03-14',
  timeStart: '21:00',
  timeEnd: '22:00',
  price: 2_000_000,
  depositAmount: 0,
}

type FlowProps = Parameters<typeof CheckoutFlow>[0]
const flowProps = (over: Partial<FlowProps> = {}): FlowProps => ({
  slug: 'club-x',
  court: 'c1',
  date: '2026-03-14',
  time: '21:00',
  dur: 60,
  formato: 5,
  pay: null,
  withDeposit: false,
  cancellationHours: 12,
  isPlayer: true,
  inAppBrowser: false,
  createAction: vi.fn(async () => {}),
  sendLinkAction: vi.fn(async () => ({ status: 'idle' as const })),
  googleAction: vi.fn(async () => ({ status: 'idle' as const })),
  ...over,
})

/** Cada valor de atributo que no es estilo: ahí también se cuela un monto (aria-label, title, value…). */
const attributeValues = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('*')).flatMap((el) =>
    Array.from(el.attributes)
      .filter((a) => !['class', 'd', 'style'].includes(a.name))
      .map((a) => `${a.name}=${a.value}`),
  )

describe('pantalla de confirmar con precios ocultos', () => {
  const cases: ReadonlyArray<readonly [string, Partial<FlowProps>]> = [
    ['sin seña, con sesión', { withDeposit: false, isPlayer: true }],
    ['sin seña, sin sesión', { withDeposit: false, isPlayer: false }],
    ['con seña, con sesión', { withDeposit: true, isPlayer: true }],
    ['con seña, sin sesión', { withDeposit: true, isPlayer: false }],
  ]

  it.each(cases)('%s: ningún "$" en el texto ni en un atributo', (_name, over) => {
    const { container } = render(
      <>
        <BookingSummary
          data={{ ...summary, depositAmount: over.withDeposit ? 600_000 : 0, hidePrices: true }}
        />
        <CheckoutFlow {...flowProps({ ...over, hidePrices: true })} />
      </>,
    )
    expect(container.textContent).not.toContain('$')
    expect(attributeValues(container).filter((a) => a.includes('$'))).toEqual([])
  })

  it('con seña y precios ocultos, la nota dice que el resto es en el complejo', () => {
    render(<CheckoutFlow {...flowProps({ withDeposit: true, hidePrices: true })} />)
    expect(
      screen.getByText('Pagás una seña online con MercadoPago; el resto, en el complejo.'),
    ).toBeTruthy()
  })

  it('con seña y precios visibles el resumen ya dice el resto: la nota no lo repite', () => {
    render(<CheckoutFlow {...flowProps({ withDeposit: true, depositAmount: 600_000 })} />)
    expect(screen.queryByText(/el resto, en el complejo/)).toBeNull()
  })

  it('control: con los precios visibles el detector sí ve el "$" (el test puede dar rojo)', () => {
    const { container } = render(
      <BookingSummary data={{ ...summary, depositAmount: 600_000, hidePrices: false }} />,
    )
    expect(container.textContent).toContain('$')
  })
})

describe('el botón de acción es uno solo', () => {
  it.each([true, false])('sin seña dice "Reservar" (con sesión: %s)', (isPlayer) => {
    render(<CheckoutFlow {...flowProps({ isPlayer })} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Reservar'])
  })

  it.each([true, false])('con seña y monto dice "Pagar seña · $" (con sesión: %s)', (isPlayer) => {
    render(<CheckoutFlow {...flowProps({ isPlayer, withDeposit: true, depositAmount: 600_000 })} />)
    expect(screen.getByRole('button', { name: /^Pagar seña · \$\s?6\.000/ })).toBeTruthy()
  })

  it('con seña y precios ocultos dice solo "Pagar seña"', () => {
    render(<CheckoutFlow {...flowProps({ withDeposit: true, hidePrices: true })} />)
    expect(screen.getByRole('button', { name: 'Pagar seña' })).toBeTruthy()
  })

  it('no hay sección ni radios de "Cómo pagás"', () => {
    render(<CheckoutFlow {...flowProps()} />)
    expect(screen.queryByText(/Cómo pagás/)).toBeNull()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('sin sesión el botón abre el ingreso en un diálogo; con sesión no hay diálogo', async () => {
    const sin = render(<CheckoutFlow {...flowProps({ isPlayer: false })} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    expect(await screen.findByRole('dialog', { name: /Entrá para reservar/ })).toBeTruthy()
    sin.unmount()

    render(<CheckoutFlow {...flowProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('política de cancelación, una línea debajo del botón', () => {
  const note = (over: Partial<FlowProps>) => {
    render(<CheckoutFlow {...flowProps(over)} />)
    return screen.getByText(/cancel/i).textContent
  }

  it('con seña dice la regla real de las horas del complejo', () => {
    expect(note({ withDeposit: true, cancellationHours: 12 })).toBe(
      'Si cancelás con más de 12 horas de anticipación, el complejo te devuelve la seña. Después, la seña queda en el complejo.',
    )
  })

  it.each([
    [1, 'con más de 1 hora de anticipación'],
    [0, 'antes de que empiece el turno'],
  ])('%s hora(s): el texto no queda en "0 horas" ni en "1 horas"', (hours, rule) => {
    expect(note({ withDeposit: true, cancellationHours: hours })).toContain(
      `Si cancelás ${rule}, el complejo te devuelve la seña.`,
    )
  })

  it('va debajo del botón, no adentro de ninguna sección de pago', () => {
    render(<CheckoutFlow {...flowProps()} />)
    const nota = screen.getByText('Podés cancelar desde Mis reservas.')
    expect(nota.closest('section, fieldset')).toBeNull()
    const button = screen.getByRole('button', { name: 'Reservar' })
    expect(button.compareDocumentPosition(nota) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sin seña no promete ningún plazo que el complejo no fijó', () => {
    expect(note({ withDeposit: false, cancellationHours: 12 })).toBe(
      'Podés cancelar desde Mis reservas.',
    )
  })
})

describe('pay y formato sobreviven', () => {
  const field = (root: HTMLElement, name: string) =>
    root.querySelector<HTMLInputElement>(`form input[type="hidden"][name="${name}"]`)?.value

  it('con sesión: el formato y el `pay` de un link viejo van al form de confirmar', () => {
    const { container } = render(<CheckoutFlow {...flowProps({ pay: 'transfer' })} />)
    expect(field(container, 'formato')).toBe('5')
    expect(field(container, 'pay')).toBe('transfer')
  })

  it('sin `pay` en la URL no se manda ninguno', () => {
    const { container } = render(<CheckoutFlow {...flowProps()} />)
    expect(field(container, 'pay')).toBeUndefined()
  })

  it('sin sesión: el next del ingreso (email y Google) lleva el formato y el pay', async () => {
    render(<CheckoutFlow {...flowProps({ isPlayer: false, pay: 'transfer' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    const dialog = await screen.findByRole('dialog')
    const nexts = Array.from(dialog.querySelectorAll<HTMLInputElement>('input[name="next"]')).map(
      (i) => i.value,
    )
    const expected =
      '/club-x/reservar?court=c1&date=2026-03-14&time=21:00&dur=60&formato=5&pay=transfer'
    expect(nexts).toEqual([expected, expected])
  })

  it('sin formato elegido no inventa uno', () => {
    const { container } = render(<CheckoutFlow {...flowProps({ formato: null })} />)
    expect(container.querySelector('input[name="formato"]')).toBeNull()
  })
})

describe('confirmación sola (el vínculo ya lo verificó la page)', () => {
  const TOKEN = 'eyJzbHVnIjoiY2x1Yi14In0.firma-de-ejemplo-0123456789abcdefghij'
  const hidden = (root: HTMLElement) =>
    root.querySelector<HTMLInputElement>('form input[type="hidden"][name="booking_intent"]')

  beforeEach(() => window.sessionStorage.clear())

  it('con el token: va en el form de confirmar, se envía una vez y el botón sigue ahí', () => {
    const props = flowProps({ autoConfirmToken: TOKEN })
    const { container } = render(<CheckoutFlow {...props} />)

    expect(hidden(container)?.value).toBe(TOKEN)
    expect(screen.getByRole('status').textContent).toBe('Confirmando tu reserva…')
    // Visible siempre; mientras envía dice "Procesando…" (el estado de envío que ya tiene).
    expect(screen.getByRole('button', { name: /Reservar|Procesando/ })).toBeTruthy()
    expect(props.createAction).toHaveBeenCalledTimes(1)
  })

  it('con un vínculo que no valió: una línea corta pide tocar el botón, y nada se envía solo', () => {
    const props = flowProps({ intentDegraded: true })
    const { container } = render(<CheckoutFlow {...props} />)

    expect(screen.getByText('Tocá Reservar para terminar.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reservar' })).toBeTruthy()
    expect(hidden(container)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(props.createAction).not.toHaveBeenCalled()
  })

  it('sin vínculo fallido no hay línea de ayuda', () => {
    render(<CheckoutFlow {...flowProps()} />)
    expect(screen.queryByText('Tocá Reservar para terminar.')).toBeNull()
  })

  it('sin token: el form es el de siempre, no se envía nada solo', () => {
    const props = flowProps()
    const { container } = render(<CheckoutFlow {...props} />)

    expect(hidden(container)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(props.createAction).not.toHaveBeenCalled()
  })

  it('sin sesión el token no hace nada: el botón abre el ingreso y no se envía nada', async () => {
    const props = flowProps({ isPlayer: false, autoConfirmToken: TOKEN })
    const { container } = render(<CheckoutFlow {...props} />)

    expect(hidden(container)).toBeNull()
    expect(props.createAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    expect(await screen.findByRole('heading', { name: 'Entrá para reservar' })).toBeTruthy()
  })

  it('el ingreso sin seña promete confirmar; con seña, no', async () => {
    const sinSena = render(<CheckoutFlow {...flowProps({ isPlayer: false })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    expect(await screen.findByText('Entrás y la reserva queda confirmada.')).toBeTruthy()
    sinSena.unmount()

    render(<CheckoutFlow {...flowProps({ isPlayer: false, withDeposit: true })} />)
    fireEvent.click(screen.getByRole('button', { name: /Pagar seña/ }))
    await screen.findByRole('dialog')
    expect(screen.queryByText('Entrás y la reserva queda confirmada.')).toBeNull()
  })
})
