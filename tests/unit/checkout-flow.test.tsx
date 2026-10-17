// @vitest-environment happy-dom
//
// La pantalla de confirmar sin el servidor: resumen + cómo se paga + política de cancelación +
// botón o ingreso. Lo que importa de esta capa: el `pay` y el `formato` viajan (URL, `next` del
// ingreso, form de confirmar) y con `hidePrices` no hay ni un monto.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import BookingSummary from '@/app/(public)/[slug]/reservar/components/BookingSummary'
import CheckoutFlow from '@/app/(public)/[slug]/reservar/components/CheckoutFlow'
import type { PayMethod } from '@/lib/booking/reserve-url'

afterEach(() => cleanup())
beforeEach(() => window.history.replaceState(null, '', '/club-x/reservar?court=c1&utm=ig'))

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
  methods: ['cash', 'transfer'],
  initialPay: 'cash',
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
  const sena = { withDeposit: true, methods: ['mercadopago'], initialPay: 'mercadopago' } as const
  const cases: ReadonlyArray<readonly [string, Partial<FlowProps>]> = [
    ['sin seña, con sesión', { withDeposit: false, isPlayer: true }],
    ['sin seña, sin sesión', { withDeposit: false, isPlayer: false }],
    ['con seña, con sesión', { ...sena, methods: [...sena.methods], isPlayer: true }],
    ['con seña, sin sesión', { ...sena, methods: [...sena.methods], isPlayer: false }],
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

  it('con seña y precios ocultos, la frase del resto en el complejo vive en la sección de pago', () => {
    render(
      <CheckoutFlow {...flowProps({ ...sena, methods: [...sena.methods], hidePrices: true })} />,
    )
    const frase = screen.getByText(
      'Para confirmar pagás una seña online con MercadoPago. El resto, en el complejo.',
    )
    expect(frase.closest('section')?.querySelector('h2')?.textContent).toBe('Cómo pagás')
  })

  it('con seña y precios visibles el resumen ya dice el resto: la sección no lo repite', () => {
    render(<CheckoutFlow {...flowProps({ ...sena, methods: [...sena.methods] })} />)
    expect(screen.getByText('Pagás la seña online con MercadoPago.')).toBeTruthy()
    expect(screen.queryByText(/El resto, en el complejo/)).toBeNull()
  })

  it('control: con los precios visibles el detector sí ve el "$" (el test puede dar rojo)', () => {
    const { container } = render(
      <BookingSummary data={{ ...summary, depositAmount: 600_000, hidePrices: false }} />,
    )
    expect(container.textContent).toContain('$')
  })
})

describe('política de cancelación, una línea debajo del pago', () => {
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

  it('la línea va DENTRO de la sección de pago, debajo de las opciones', () => {
    render(<CheckoutFlow {...flowProps()} />)
    const nota = screen.getByText('Podés cancelar desde Mis reservas.')
    const seccion = nota.closest('fieldset')!
    expect(seccion.querySelector('legend')?.textContent).toBe('Cómo pagás en el complejo')
    expect(seccion.lastElementChild).toBe(nota)
  })

  it('sin seña no promete ningún plazo que el complejo no fijó', () => {
    expect(note({ withDeposit: false, cancellationHours: 12 })).toBe(
      'Podés cancelar desde Mis reservas.',
    )
  })
})

describe('pay y formato sobreviven', () => {
  const chooseTransfer = () => fireEvent.click(screen.getByRole('radio', { name: /Transferencia/ }))

  it('con sesión: la elección va a la URL (conservando el resto) y al form de confirmar', () => {
    const { container } = render(<CheckoutFlow {...flowProps()} />)
    const field = (name: string) =>
      (container.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement).value

    expect(field('pay')).toBe('cash')
    expect(field('formato')).toBe('5')

    chooseTransfer()

    expect(field('pay')).toBe('transfer')
    const url = new URL(window.location.href)
    expect(url.searchParams.get('pay')).toBe('transfer')
    expect(url.searchParams.get('utm')).toBe('ig')
    expect(url.searchParams.get('court')).toBe('c1')
  })

  it('sin sesión: el next del ingreso (email y Google) lleva el pay y el formato elegidos', () => {
    const { container } = render(<CheckoutFlow {...flowProps({ isPlayer: false })} />)
    const nexts = () =>
      Array.from(container.querySelectorAll<HTMLInputElement>('input[name="next"]')).map(
        (i) => i.value,
      )

    expect(nexts()).toHaveLength(2)
    chooseTransfer()

    const expected =
      '/club-x/reservar?court=c1&date=2026-03-14&time=21:00&dur=60&formato=5&pay=transfer'
    expect(nexts()).toEqual([expected, expected])
  })

  it('sin formato elegido no inventa uno; con un solo método no hay radios pero el pay viaja', () => {
    const methods: PayMethod[] = ['cash']
    const { container } = render(
      <CheckoutFlow {...flowProps({ formato: null, methods, initialPay: 'cash' })} />,
    )
    expect(container.querySelector('input[name="formato"]')).toBeNull()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(
      (container.querySelector('input[type="hidden"][name="pay"]') as HTMLInputElement).value,
    ).toBe('cash')
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
    expect(screen.getByRole('button', { name: /Confirmar reserva|Procesando/ })).toBeTruthy()
    expect(props.createAction).toHaveBeenCalledTimes(1)
  })

  it('mientras confirma, el selector de pago se bloquea (un cambio ahí ya no se aplicaría)', () => {
    const { container } = render(<CheckoutFlow {...flowProps({ autoConfirmToken: TOKEN })} />)

    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios).toHaveLength(2)
    expect(radios.every((r) => r.disabled)).toBe(true)
    // Lo que se envió es lo que estaba elegido.
    expect(
      (container.querySelector('input[type="hidden"][name="pay"]') as HTMLInputElement).value,
    ).toBe('cash')
  })

  it('sin confirmación sola el selector queda libre', () => {
    render(<CheckoutFlow {...flowProps()} />)
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios.every((r) => !r.disabled)).toBe(true)
  })

  it('con un vínculo que no valió: una línea corta pide tocar el botón, y nada se envía solo', () => {
    const props = flowProps({ intentDegraded: true })
    const { container } = render(<CheckoutFlow {...props} />)

    expect(screen.getByText('Tocá Confirmar reserva para terminar.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirmar reserva' })).toBeTruthy()
    expect(hidden(container)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(props.createAction).not.toHaveBeenCalled()
    expect((screen.getAllByRole('radio') as HTMLInputElement[]).every((r) => !r.disabled)).toBe(
      true,
    )
  })

  it('sin vínculo fallido no hay línea de ayuda', () => {
    render(<CheckoutFlow {...flowProps()} />)
    expect(screen.queryByText('Tocá Confirmar reserva para terminar.')).toBeNull()
  })

  it('sin token: el form es el de siempre, no se envía nada solo', () => {
    const props = flowProps()
    const { container } = render(<CheckoutFlow {...props} />)

    expect(hidden(container)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(props.createAction).not.toHaveBeenCalled()
  })

  it('sin sesión el token no hace nada: se ve el ingreso', () => {
    const props = flowProps({ isPlayer: false, autoConfirmToken: TOKEN })
    const { container } = render(<CheckoutFlow {...props} />)

    expect(hidden(container)).toBeNull()
    expect(props.createAction).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Entrá para reservar' })).toBeTruthy()
  })

  it('el ingreso sin seña promete confirmar; con seña, no', () => {
    const sinSena = render(<CheckoutFlow {...flowProps({ isPlayer: false })} />)
    expect(screen.getByText('Entrás y la reserva queda confirmada.')).toBeTruthy()
    sinSena.unmount()

    render(
      <CheckoutFlow
        {...flowProps({
          isPlayer: false,
          withDeposit: true,
          methods: ['mercadopago'],
          initialPay: 'mercadopago',
        })}
      />,
    )
    expect(screen.queryByText('Entrás y la reserva queda confirmada.')).toBeNull()
  })
})
