// @vitest-environment happy-dom
//
// El ingreso de /reservar con React REAL y las actions como mocks: nada se deshabilita por la
// casilla, el error sale EN el campo y el foco va ahí (Google ataja la casilla sin tildar en el
// cliente, sin vuelta al servidor), lo tipeado se conserva, un corte de red no tira la página y lo
// dice con las palabras del botón que lo causó, y el "enviado" dice la verdad de hoy.
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
const termsError = (): GateState => ({
  status: 'error',
  message: 'Tenés que aceptar los términos.',
  field: 'terms',
})
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
  props: { action?: Action; googleAction?: Action; inAppBrowser?: boolean } = {},
) {
  const action = vi.fn<Action>(props.action ?? (async () => ({ status: 'idle' })))
  const googleAction = vi.fn<Action>(props.googleAction ?? (async () => ({ status: 'idle' })))
  render(
    <LoginGate
      next={NEXT}
      action={action}
      googleAction={googleAction}
      inAppBrowser={props.inAppBrowser}
    />,
  )
  return { action, googleAction }
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const click = (name: string | RegExp) =>
  act(async () => {
    fireEvent.click(button(name))
  })
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const checkbox = () => screen.getByRole('checkbox') as HTMLInputElement

describe('LoginGate — la casilla del +18', () => {
  it('nada se deshabilita por la casilla: los dos botones se pueden tocar sin tildarla', () => {
    renderGate()
    expect(button('Continuar con Google').disabled).toBe(false)
    expect(button('Continuar con mi email').disabled).toBe(false)
  })

  it('Google sin la casilla: el error y el foco salen al instante, sin vuelta al servidor', async () => {
    const { googleAction } = renderGate({ googleAction: async () => termsError() })
    await click('Continuar con Google')

    const box = checkbox()
    expect(box).toHaveFocus()
    expect(box.getAttribute('aria-invalid')).toBe('true')
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('Tenés que aceptar los términos.')
    expect(box.getAttribute('aria-describedby')).toBe(alert.id)
    // La action no se llamó: el cliente atajó la casilla (el servidor la exige igual, ver
    // reservar-gate-actions.test.ts).
    expect(googleAction).not.toHaveBeenCalled()
    // Y el botón no quedó en "Abriendo Google…": no hubo envío.
    expect(button('Continuar con Google').disabled).toBe(false)
  })

  it('Google sin la casilla, otra vez: el foco vuelve a la casilla aunque lo hayan movido', async () => {
    renderGate()
    await click('Continuar con Google')
    screen.getByLabelText('Nombre').focus()
    await click('Continuar con Google')

    expect(checkbox()).toHaveFocus()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('con la casilla tildada la action de Google SÍ se llama, con terms=on y el next (formato y pay)', async () => {
    const { googleAction } = renderGate()
    fireEvent.click(checkbox())
    await click('Continuar con Google')

    expect(googleAction).toHaveBeenCalledTimes(1)
    expect(googleAction.mock.calls[0]![1].get('terms')).toBe('on')
    expect(googleAction.mock.calls[0]![1].get('next')).toBe(NEXT)
  })

  it('con la casilla tildada viaja terms=on a Google y al email', async () => {
    const { googleAction, action } = renderGate()
    fireEvent.click(checkbox())
    await click('Continuar con Google')
    await click('Continuar con mi email')

    expect(googleAction.mock.calls[0]![1].get('terms')).toBe('on')
    expect(action.mock.calls[0]![1].get('terms')).toBe('on')
  })

  it('el link a los términos está FUERA del rótulo: tocarlo no tilda la casilla', () => {
    renderGate()
    const link = screen.getByRole('link', { name: /Leer los términos y condiciones/ })
    expect(link.getAttribute('href')).toBe('/terminos')
    expect(link.closest('label')).toBeNull()
    // El foco es el anillo del mundo, no el contorno por defecto del navegador.
    expect(link.className).toContain('focus-visible:ring-2')
    expect(link.className).toContain('focus-visible:outline-hidden')
  })

  it('el error de la casilla se va cuando se tilda', async () => {
    renderGate()
    await click('Continuar con Google')
    screen.getByRole('alert')

    fireEvent.click(checkbox())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(checkbox().getAttribute('aria-invalid')).toBeNull()
  })
})

describe('LoginGate — los valores del email no los vacía Google', () => {
  const emailError = (): GateState => ({
    status: 'error',
    message: 'Ingresá un email válido',
    field: 'email',
    values: { firstName: 'Tomás', email: 'tomas@' },
  })

  async function conErrorDeEmail(googleAction?: Action) {
    const gate = renderGate({ action: async () => emailError(), googleAction })
    type('Nombre', 'Tomás')
    type('Email', 'tomas@')
    fireEvent.click(checkbox())
    await click('Continuar con mi email')
    await screen.findByText('Ingresá un email válido')
    return gate
  }

  const valores = () => [
    (screen.getByLabelText('Nombre') as HTMLInputElement).value,
    (screen.getByLabelText('Email') as HTMLInputElement).value,
  ]

  it('email con error y después Google con la red caída: Nombre y Email intactos', async () => {
    await conErrorDeEmail(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect(valores()).toEqual(['Tomás', 'tomas@'])

    await click('Continuar con Google')
    await screen.findByText(GOOGLE_OFFLINE)

    expect(valores()).toEqual(['Tomás', 'tomas@'])
  })

  it('email con error y después Google sin la casilla: Nombre y Email intactos', async () => {
    await conErrorDeEmail()
    fireEvent.click(checkbox()) // la destilda: ahora Google se ataja en el cliente
    await click('Continuar con Google')
    await screen.findByText('Tenés que aceptar los términos.')

    expect(valores()).toEqual(['Tomás', 'tomas@'])
  })
})

describe('LoginGate — nombre y email', () => {
  it('error de un campo: junto a su campo, aria-invalid, foco ahí y lo tipeado se conserva', async () => {
    renderGate({
      action: async () => ({
        status: 'error',
        message: 'Ingresá un email válido',
        field: 'email',
        values: { firstName: 'Tomás', email: 'tomas@' },
      }),
    })
    type('Nombre', 'Tomás')
    type('Email', 'tomas@')
    await click('Continuar con mi email')

    const email = screen.getByLabelText('Email') as HTMLInputElement
    await waitFor(() => expect(email).toHaveFocus())
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toBe('Ingresá un email válido')
    expect(email.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
    expect(email.value).toBe('tomas@')
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Tomás')
    expect(screen.getByLabelText('Nombre').getAttribute('aria-invalid')).toBeNull()
  })

  it('no pide apellido', () => {
    renderGate()
    expect(screen.queryByLabelText(/Apellido/)).toBeNull()
    expect(screen.getByLabelText('Nombre')).toBeTruthy()
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
})

describe('LoginGate — orden según el navegador', () => {
  const order = () => screen.getAllByRole('button').map((b) => b.textContent)

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
    type('Nombre', 'Tomás')
    type('Email', 'tomas@example.com')
    await click('Continuar con mi email')

    expect((await screen.findByRole('alert')).textContent).toBe(OFFLINE)
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('tomas@example.com')
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Tomás')
    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(button('Continuar con mi email').disabled).toBe(false)
  })

  it('sin red en Google: dice lo de Google, debajo de su botón, no lo del enlace del email', async () => {
    renderGate({ googleAction: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) })
    fireEvent.click(checkbox())
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
    fireEvent.click(checkbox())
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

  it('título con foco, a qué email, y la verdad de hoy: vuelve a esta pantalla y ahí confirma', async () => {
    renderGate({ action: async () => sent() })
    await click('Continuar con mi email')

    const title = await screen.findByRole('heading', { level: 2, name: 'Revisá tu email' })
    await waitFor(() => expect(title).toHaveFocus())
    expect(screen.getByText('tomas@example.com').closest('p')?.textContent).toBe(
      'Te mandamos un enlace a tomas@example.com.',
    )
    expect(
      screen.getByText(/volvés a esta pantalla con tu cuenta y ahí confirmás la reserva/),
    ).toBeTruthy()
    // La action crea la cuenta: no es el "si tiene cuenta" de /ingresar.
    expect(screen.queryByText(/tiene cuenta/)).toBeNull()
  })

  it('Reenviar corre la misma action con nombre, email, next y la casilla, tras la espera de 60 s', async () => {
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

  it('Usar otro email vuelve al formulario con el email seleccionado y el nombre conservado', async () => {
    const select = vi.spyOn(HTMLInputElement.prototype, 'select')
    renderGate({ action: async () => sent() })
    await click('Continuar con mi email')
    await click('Usar otro email')

    const email = screen.getByLabelText('Email') as HTMLInputElement
    await waitFor(() => expect(email).toHaveFocus())
    expect(email.value).toBe('tomas@example.com')
    // happy-dom no expone la selección de un input email: se mira que se pida.
    expect(select).toHaveBeenCalled()
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Tomás')
  })
})
