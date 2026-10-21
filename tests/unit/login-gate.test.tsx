// @vitest-environment happy-dom
//
// El ingreso de /reservar (un modal) con React REAL y las actions como mocks: sin casilla de +18
// (tocar un botón es aceptar, los dos forms mandan terms=on), solo email (el nombre lo deriva el
// servidor), el error sale EN el campo del email y el foco va ahí, lo tipeado se conserva, un corte
// de red no tira la página y lo dice con las palabras del botón que lo causó, el "enviado" dice la
// verdad de hoy y el modal se cierra con Esc y, reabierto, recuerda que ya se mandó el enlace.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as Sentry from '@sentry/nextjs'
import LoginGate from '@/app/(public)/[slug]/reservar/components/LoginGate'
import type { GateState } from '@/app/(public)/[slug]/reservar/actions'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }))
// Solo `unstable_rethrow` (la real, que lee el digest de la excepción) hace falta en el bundle.
vi.mock('next/navigation', async (importOriginal) => importOriginal())

const NEXT = '/club-x/reservar?court=c1&date=2026-03-14&time=21:00&dur=60'
const OFFLINE = 'No pudimos enviar el enlace. Revisá tu conexión e intentá de nuevo.'
const GOOGLE_OFFLINE = 'No pudimos abrir Google. Revisá tu conexión y probá de nuevo.'

type Action = (prev: GateState, formData: FormData) => Promise<GateState>
const sent = (): GateState => ({ status: 'sent', email: 'tomas@example.com', firstName: 'Tomás' })

beforeEach(() => {
  vi.mocked(Sentry.captureException).mockClear()
  vi.mocked(Sentry.addBreadcrumb).mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderGate(
  props: {
    action?: Action
    googleAction?: Action
    inAppBrowser?: boolean
    withDeposit?: boolean
  } = {},
) {
  const action = vi.fn<Action>(props.action ?? (async () => ({ status: 'idle' })))
  const googleAction = vi.fn<Action>(props.googleAction ?? (async () => ({ status: 'idle' })))
  const onOpenChange = vi.fn()
  const gate = (open: boolean) => (
    <LoginGate
      open={open}
      onOpenChange={onOpenChange}
      next={NEXT}
      action={action}
      googleAction={googleAction}
      inAppBrowser={props.inAppBrowser}
      withDeposit={props.withDeposit ?? false}
    />
  )
  const { rerender } = render(gate(true))
  return { action, googleAction, onOpenChange, setOpen: (open: boolean) => rerender(gate(open)) }
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const click = (name: string | RegExp) =>
  act(async () => {
    fireEvent.click(button(name))
  })
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('LoginGate — el +18 sin casilla (clickwrap)', () => {
  it('no hay casilla ni campo de nombre: solo el email', () => {
    renderGate()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByLabelText(/Nombre|Apellido/)).toBeNull()
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('los dos botones se pueden tocar de entrada', () => {
    renderGate()
    expect(button('Continuar con Google').disabled).toBe(false)
    expect(button('Continuar con mi email').disabled).toBe(false)
  })

  it('debajo de los botones dice que continuar es declarar +18 y aceptar los términos', () => {
    renderGate()
    const text = screen.getByText(/Al continuar declarás que sos mayor de 18 años y aceptás los/)
    expect(text.textContent).toContain('Términos y condiciones')
    const google = button('Continuar con Google')
    expect(google.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Google y el email mandan terms=on y el next (formato y pay) sin que nadie tilde nada', async () => {
    const { googleAction, action } = renderGate()
    await click('Continuar con Google')
    await click('Continuar con mi email')

    expect(googleAction).toHaveBeenCalledTimes(1)
    expect(googleAction.mock.calls[0]![1].get('terms')).toBe('on')
    expect(googleAction.mock.calls[0]![1].get('next')).toBe(NEXT)
    expect(action.mock.calls[0]![1].get('terms')).toBe('on')
    expect(action.mock.calls[0]![1].get('next')).toBe(NEXT)
  })

  it('el email no manda nombre: lo deriva el servidor', async () => {
    const { action } = renderGate()
    type('Email', 'lazaro.feijoo2004@gmail.com')
    await click('Continuar con mi email')

    expect(action.mock.calls[0]![1].get('firstName')).toBeNull()
    expect(action.mock.calls[0]![1].get('email')).toBe('lazaro.feijoo2004@gmail.com')
  })

  it('el link a los términos va en otra pestaña, con 44 px de alto táctil y foco visible', () => {
    renderGate()
    const link = screen.getByRole('link', { name: /Términos y condiciones/ })
    expect(link.getAttribute('href')).toBe('/terminos')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.className).toContain('min-h-11')
    expect(link.className).toContain('focus-visible:ring-2')
    expect(link.className).toContain('focus-visible:outline-hidden')
    expect(link.textContent).toContain('se abre en otra pestaña')
  })
})

describe('LoginGate — el modal', () => {
  it('es un diálogo con nombre accesible y se cierra con Esc', () => {
    const { onOpenChange } = renderGate()
    const dialog = screen.getByRole('dialog', { name: 'Entrá para reservar' })
    expect(dialog).toBeTruthy()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('cerrado no pinta nada', () => {
    const { setOpen } = renderGate()
    setOpen(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('el botón de cerrar mide 44 px', () => {
    renderGate()
    // El primitivo trae una X de 24 px: el panel la agranda con una variante sobre su hijo directo.
    const close = screen.getByRole('button', { name: 'Cerrar' })
    expect(close.parentElement).toBe(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog').className).toContain('[&>button]:size-11')
  })

  it('si se cerró después de mandar el enlace, al reabrirlo sigue el "Revisá tu email"', async () => {
    const { setOpen } = renderGate({ action: async () => sent() })
    await click('Continuar con mi email')
    await screen.findByRole('heading', { name: 'Revisá tu email' })

    setOpen(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    setOpen(true)

    expect(screen.getByRole('dialog', { name: 'Revisá tu email' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continuar con mi email' })).toBeNull()
  })
})

describe('LoginGate — qué pasa al entrar', () => {
  const PROMESA = 'Entrás y la reserva queda confirmada.'

  it('sin seña lo dice en una línea cerca de los botones, sin competir con ellos', () => {
    renderGate()
    const line = screen.getByText(PROMESA)
    // Es texto de apoyo: no es un botón ni un título, y va antes de los botones que lo cumplen.
    expect(line.tagName).toBe('P')
    expect(line.className).toContain('text-muted-foreground')
    expect(line.className).toMatch(/text-(sm|base)(\s|$)/)
    const google = button('Continuar con Google')
    expect(line.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('con seña no promete nada nuevo', () => {
    renderGate({ withDeposit: true })
    expect(screen.queryByText(PROMESA)).toBeNull()
  })
})

describe('LoginGate — el email no lo vacía Google', () => {
  it('email con error y después Google con la red caída: el Email queda intacto', async () => {
    renderGate({
      action: async () => ({
        status: 'error',
        message: 'Ingresá un email válido',
        field: 'email',
        values: { email: 'tomas@' },
      }),
      googleAction: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    })
    type('Email', 'tomas@')
    await click('Continuar con mi email')
    await screen.findByText('Ingresá un email válido')
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('tomas@')

    await click('Continuar con Google')
    await screen.findByText(GOOGLE_OFFLINE)

    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('tomas@')
  })
})

describe('LoginGate — el email', () => {
  it('error del campo: junto al campo, aria-invalid, foco ahí y lo tipeado se conserva', async () => {
    renderGate({
      action: async () => ({
        status: 'error',
        message: 'Ingresá un email válido',
        field: 'email',
        values: { email: 'tomas@' },
      }),
    })
    type('Email', 'tomas@')
    await click('Continuar con mi email')

    const email = screen.getByLabelText('Email') as HTMLInputElement
    await waitFor(() => expect(email).toHaveFocus())
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toBe('Ingresá un email válido')
    expect(email.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
    expect(email.value).toBe('tomas@')
  })

  it('un error sin campo (límite de pedidos, mail que falló) sale arriba del botón y no marca nada', async () => {
    renderGate({
      action: async () => ({ status: 'error', message: 'Demasiados intentos. Esperá un minuto.' }),
    })
    await click('Continuar con mi email')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Demasiados intentos. Esperá un minuto.',
    )
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
  })

  it('un error de otro campo (un nombre forjado muy largo) sale junto al botón, sin campo que marcar', async () => {
    renderGate({
      action: async () => ({
        status: 'error',
        message: 'Máximo 80 caracteres',
        field: 'firstName',
      }),
    })
    await click('Continuar con mi email')

    expect((await screen.findByRole('alert')).textContent).toBe('Máximo 80 caracteres')
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
  })
})

describe('LoginGate — orden según el navegador', () => {
  const order = () =>
    screen
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((text) => text !== 'Cerrar')

  it('navegador común: primero Google, después el email', () => {
    renderGate()
    expect(order()).toEqual(['Continuar con Google', 'Continuar con mi email'])
    expect(screen.queryByText(/Google puede no abrirse/)).toBeNull()
  })

  it('navegador interno: primero el email y, debajo de Google, la aclaración', () => {
    renderGate({ inAppBrowser: true })
    expect(order()).toEqual(['Continuar con mi email', 'Continuar con Google'])
    expect(screen.getByText(/Google puede no abrirse desde este navegador/)).toBeTruthy()
  })
})

describe('LoginGate — la request no vuelve', () => {
  it('sin red: mensaje, lo tipeado intacto y un breadcrumb, no un evento de Sentry', async () => {
    renderGate({ action: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) })
    type('Email', 'tomas@example.com')
    await click('Continuar con mi email')

    expect((await screen.findByRole('alert')).textContent).toBe(OFFLINE)
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('tomas@example.com')
    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(button('Continuar con mi email').disabled).toBe(false)
  })

  it('sin red en Google: dice lo de Google, debajo de su botón, no lo del enlace del email', async () => {
    renderGate({ googleAction: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) })
    await click('Continuar con Google')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(GOOGLE_OFFLINE)
    expect(screen.queryByText(OFFLINE)).toBeNull()
    // Junto al botón que falló: es el hermano siguiente de su formulario, fuera de los dos forms.
    expect(alert.closest('form')).toBeNull()
    expect(button('Continuar con Google').closest('form')?.nextElementSibling).toBe(alert)
    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('sin red en el email sigue diciendo lo del enlace, dentro del formulario del email', async () => {
    renderGate({ action: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) })
    await click('Continuar con mi email')

    await screen.findByText(OFFLINE)
    // Se consulta de nuevo el formulario: el alert se busca ADENTRO del que tiene el botón del email.
    const form = button('Continuar con mi email').closest('form')!
    expect(within(form).getByRole('alert').textContent).toBe(OFFLINE)
  })

  it('otro rechazo es una falla real: va a Sentry', async () => {
    const boom = new Error('boom')
    renderGate({ googleAction: vi.fn().mockRejectedValue(boom) })
    await click('Continuar con Google')

    expect((await screen.findByRole('alert')).textContent).toBe(GOOGLE_OFFLINE)
    expect(Sentry.captureException).toHaveBeenCalledWith(boom)
  })

  it('una pestaña de antes de un deploy pide recargar', async () => {
    const stale = new UnrecognizedActionError('Server Action "abc" was not found on the server.')
    renderGate({ action: vi.fn().mockRejectedValue(stale) })
    await click('Continuar con mi email')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'La página quedó desactualizada. Recargala y probá de nuevo.',
    )
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })
})

describe('LoginGate — enviado', () => {
  const fakeCountdown = () => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })

  it('título con foco, a qué email, y sin seña: al tocar el enlace la reserva queda confirmada', async () => {
    renderGate({ action: async () => sent() })
    await click('Continuar con mi email')

    const title = await screen.findByRole('heading', { name: 'Revisá tu email' })
    await waitFor(() => expect(title).toHaveFocus())
    expect(screen.getByText('tomas@example.com').closest('p')?.textContent).toBe(
      'Te mandamos un enlace a tomas@example.com.',
    )
    expect(screen.getByText('Cuando lo toques, tu reserva queda confirmada.')).toBeTruthy()
    expect(screen.queryByText(/volvés a esta pantalla/)).toBeNull()
    // La action crea la cuenta: no es el "si tiene cuenta" de /ingresar.
    expect(screen.queryByText(/tiene cuenta/)).toBeNull()
  })

  it('con seña no promete confirmar: vuelve a esta pantalla y ahí paga la seña', async () => {
    renderGate({ action: async () => sent(), withDeposit: true })
    await click('Continuar con mi email')

    await screen.findByRole('heading', { name: 'Revisá tu email' })
    expect(
      screen.getByText(/volvés a esta pantalla con tu cuenta y ahí pagás la seña/),
    ).toBeTruthy()
    expect(screen.queryByText(/queda confirmada/)).toBeNull()
  })

  it('Reenviar corre la misma action con email, next, terms y el nombre que devolvió el servidor, tras 60 s', async () => {
    fakeCountdown()
    const { action } = renderGate({ action: async () => sent() })
    await click('Continuar con mi email')
    await screen.findByRole('heading', { name: 'Revisá tu email' })

    expect(button(/^Reenviar en 60 s$/).disabled).toBe(true)
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    await click('Reenviar enlace')

    expect(action).toHaveBeenCalledTimes(2)
    const resend = action.mock.calls[1]![1]
    expect(Object.fromEntries(resend.entries())).toEqual({
      email: 'tomas@example.com',
      firstName: 'Tomás',
      next: NEXT,
      terms: 'on',
    })
    expect((await screen.findByRole('status')).textContent).toBe(
      'Listo: te mandamos otro enlace. Usá el del último correo.',
    )
  })

  it('Usar otro email vuelve al formulario con el email seleccionado', async () => {
    const select = vi.spyOn(HTMLInputElement.prototype, 'select')
    renderGate({ action: async () => sent() })
    await click('Continuar con mi email')
    await click('Usar otro email')

    const email = screen.getByLabelText('Email') as HTMLInputElement
    await waitFor(() => expect(email).toHaveFocus())
    // happy-dom no expone la selección de un input email: se mira que se pida.
    expect(select).toHaveBeenCalled()
    expect(email.value).toBe('tomas@example.com')
  })
})
