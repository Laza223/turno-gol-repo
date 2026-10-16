// @vitest-environment happy-dom
//
// /ingresar con React REAL (ingresar-page.test.tsx solo mira la page): un solo envío por toque,
// el panel de "enviado", Reenviar con su espera y el corte de red.
import { Component, Profiler, type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as Sentry from '@sentry/nextjs'
import { IngresarForm, type PlayerLoginAction } from '@/app/(auth)/ingresar/IngresarForm'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }))

// Solo useSearchParams es falso: unstable_rethrow es el real, y la pestaña vieja se prueba con la
// clase real de Next (UnrecognizedActionError), así que si Next le cambia el nombre, falla acá.
const searchStr = vi.fn(() => '')
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(searchStr()),
}))

beforeEach(() => {
  searchStr.mockReturnValue('')
  vi.mocked(Sentry.captureException).mockClear()
  vi.mocked(Sentry.addBreadcrumb).mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// El reloj y el setInterval de la cuenta regresiva: con setTimeout falso los findBy de Testing Library se cuelgan.
const fakeCountdown = () => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })

const OFFLINE = 'No pudimos enviar el enlace. Revisá tu conexión e intentá de nuevo.'
const STALE = 'La página quedó desactualizada. Recargala y probá de nuevo.'
const RATE_LIMITED = 'Demasiados intentos. Esperá un minuto.'

// Un objeto nuevo por respuesta, como la Server Action.
const sent = () => ({ status: 'sent' as const, email: 'tomas@example.com' })
const rateLimited = () => ({ status: 'error' as const, message: RATE_LIMITED })

const renderForm = (
  action: PlayerLoginAction,
  props: { googleAction?: () => Promise<void>; inAppBrowser?: boolean } = {},
) =>
  render(
    <IngresarForm
      action={action}
      googleAction={props.googleAction ?? vi.fn()}
      inAppBrowser={props.inAppBrowser}
    />,
  )

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const click = (name: string | RegExp) =>
  act(async () => {
    fireEvent.click(button(name))
  })
const tick = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms)
  })

describe('IngresarForm — un solo envío por toque', () => {
  it('un segundo toque mientras la action corre no manda otro mail', async () => {
    let release: (s: ReturnType<typeof sent>) => void = () => {}
    const action = vi.fn<PlayerLoginAction>(() => new Promise((resolve) => (release = resolve)))
    renderForm(action)
    const submit = button('Mandame el enlace')

    try {
      await act(async () => {
        fireEvent.click(submit)
      })
      expect(submit.disabled).toBe(true)
      await act(async () => {
        fireEvent.click(submit)
      })
    } finally {
      // Una action sin liberar deja viva una transición que rompe los tests siguientes.
      await act(async () => release(sent()))
    }

    // React encola los toques que llegan con una action en vuelo y los corre al terminar: el
    // conteo se mira DESPUÉS de liberar, que es cuando un segundo envío aparecería.
    expect(screen.getByRole('heading', { level: 1, name: 'Revisá tu email' })).toBeTruthy()
    expect(action).toHaveBeenCalledTimes(1)
  })
})

describe('IngresarForm — enviado', () => {
  it('no afirma que el mail salió: la action contesta "sent" aunque ese email no tenga cuenta', async () => {
    renderForm(vi.fn<PlayerLoginAction>(async () => sent()))
    await click('Mandame el enlace')

    expect(screen.getByRole('heading', { level: 1, name: 'Revisá tu email' })).toBeTruthy()
    expect(screen.getByText('tomas@example.com').closest('p')?.textContent).toBe(
      'Si tomas@example.com tiene cuenta, te enviamos un enlace para entrar.',
    )
    expect(screen.getByText(/¿No llegó\?/)).toBeTruthy()
    expect(button('Usar otro email')).toBeTruthy()
    // El "¿Primera vez en TurnoGol?" del formulario no se repite: lo reemplaza el bloque de abajo.
    expect(screen.queryByText(/¿Primera vez en TurnoGol\?/)).toBeNull()
  })

  it('primera vez: en un navegador común ofrece el mismo Google, con el mismo next', async () => {
    searchStr.mockReturnValue('next=%2Fcomplejo-fenix%2Freservar')
    const googleAction = vi.fn(async () => {})
    renderForm(
      vi.fn<PlayerLoginAction>(async () => sent()),
      { googleAction },
    )
    await click('Mandame el enlace')

    // "reservá tu primer turno" es un link a Explorar, con el mismo estilo que el del formulario.
    const link = screen.getByRole('link', { name: 'reservá tu primer turno' })
    expect(link.getAttribute('href')).toBe('/explorar')
    expect(link.closest('p')?.textContent).toBe(
      '¿Primera vez? Entrá con Google o reservá tu primer turno: la cuenta se crea sola.',
    )
    await click('Continuar con Google')
    expect(googleAction).toHaveBeenCalledTimes(1)
    const [formData] = googleAction.mock.calls[0] as unknown as [FormData]
    expect(formData.get('next')).toBe('/complejo-fenix/reservar')
  })

  it('primera vez: en el navegador interno no ofrece Google', async () => {
    renderForm(
      vi.fn<PlayerLoginAction>(async () => sent()),
      { inAppBrowser: true },
    )
    await click('Mandame el enlace')

    const link = screen.getByRole('link', { name: 'Reservá tu primer turno' })
    expect(link.getAttribute('href')).toBe('/explorar')
    expect(link.closest('p')?.textContent).toBe(
      '¿Primera vez? Reservá tu primer turno y la cuenta se crea sola.',
    )
    expect(screen.queryByRole('button', { name: 'Continuar con Google' })).toBeNull()
  })
})

describe('IngresarForm — Reenviar', () => {
  it('queda bloqueado un minuto con la cuenta a la vista', async () => {
    fakeCountdown()
    renderForm(vi.fn<PlayerLoginAction>(async () => sent()))
    await click('Mandame el enlace')
    const resend = () => screen.getByRole('button', { name: /^Reenviar/ }) as HTMLButtonElement

    expect(resend().textContent).toBe('Reenviar en 60 s')
    expect(resend().disabled).toBe(true)
    await tick(59_000)
    expect(resend().textContent).toBe('Reenviar en 1 s')
    expect(resend().disabled).toBe(true)
    await tick(1_000)
    expect(resend().textContent).toBe('Reenviar enlace')
    expect(resend().disabled).toBe(false)
  })

  it('cuenta contra el reloj y no ticks: si los timers se frenaron en segundo plano, al volver ya se puede reenviar', async () => {
    fakeCountdown()
    renderForm(vi.fn<PlayerLoginAction>(async () => sent()))
    await click('Mandame el enlace')
    const resend = () => screen.getByRole('button', { name: /^Reenviar/ }) as HTMLButtonElement
    expect(resend().textContent).toBe('Reenviar en 60 s')

    // iOS y los WebViews frenan los timers con la app en segundo plano: pasan 90 s de reloj sin que
    // corra ningún intervalo, y al volver se dispara UN tick. Contando ticks quedarían 59 s.
    vi.setSystemTime(Date.now() + 90_000)
    await tick(1_000)

    expect(resend().textContent).toBe('Reenviar enlace')
    expect(resend().disabled).toBe(false)
  })

  it('corre la misma action con el mismo email y la espera arranca de nuevo', async () => {
    fakeCountdown()
    const action = vi.fn<PlayerLoginAction>(async () => sent())
    renderForm(action)
    await click('Mandame el enlace')
    await tick(60_000)

    await click('Reenviar enlace')
    await screen.findByRole('status')
    // Sincrónico, sin waitFor: el aviso y la espera salen juntos.
    expect(action).toHaveBeenCalledTimes(2)
    expect(action.mock.calls[1]![1].get('email')).toBe('tomas@example.com')
    // Cada reenvío genera un token nuevo: el del último correo es el que sirve.
    expect(screen.getByRole('status').textContent).toBe(
      'Listo: si ese email tiene cuenta, te llega otro enlace. Usá el del último correo.',
    )
    expect(button('Reenviar en 60 s').disabled).toBe(true)
  })

  it('si la action limita, muestra su mensaje tal cual y la espera arranca de nuevo', async () => {
    fakeCountdown()
    const action = vi
      .fn<PlayerLoginAction>()
      .mockResolvedValueOnce(sent())
      .mockResolvedValueOnce(rateLimited())
    renderForm(action)
    await click('Mandame el enlace')
    await tick(60_000)

    await click('Reenviar enlace')
    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toBe(RATE_LIMITED)
    expect(screen.queryByRole('status')).toBeNull()
    expect(button('Reenviar en 60 s').disabled).toBe(true)
  })

  it('el aviso y la espera se pintan en el mismo commit (nunca el aviso con el botón libre)', async () => {
    fakeCountdown()
    const frames: Array<{ notice: boolean; blocked: boolean }> = []
    const onRender = () => {
      const resend = screen.queryByRole('button', { name: /^Reenvi/ }) as HTMLButtonElement | null
      if (resend) frames.push({ notice: !!screen.queryByRole('status'), blocked: resend.disabled })
    }
    render(
      <Profiler id="ingresar" onRender={onRender}>
        <IngresarForm
          action={vi.fn<PlayerLoginAction>(async () => sent())}
          googleAction={vi.fn()}
        />
      </Profiler>,
    )
    await click('Mandame el enlace')
    await tick(60_000)
    await click('Reenviar enlace')
    await screen.findByRole('status')

    expect(frames.some((f) => f.notice)).toBe(true)
    expect(frames.filter((f) => f.notice && !f.blocked)).toEqual([])
  })
})

describe('IngresarForm — la request no vuelve o falla', () => {
  it('sin red no se cae la página: mensaje, email conservado y un breadcrumb, no un evento de Sentry', async () => {
    const cut = new TypeError('Failed to fetch')
    renderForm(vi.fn<PlayerLoginAction>().mockRejectedValue(cut))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tomas@example.com' } })

    await click('Mandame el enlace')
    await screen.findByRole('alert')

    expect(screen.getByRole('alert').textContent).toBe(OFFLINE)
    const email = screen.getByLabelText('Email') as HTMLInputElement
    expect(email.value).toBe('tomas@example.com')
    // El email no tiene nada de malo: no se marca inválido.
    expect(email.getAttribute('aria-invalid')).toBeNull()
    expect(button('Mandame el enlace').disabled).toBe(false)
    // Un 4G inestable es normal: deja rastro en el breadcrumb de otro error, no llena Sentry.
    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('en Reenviar el corte lo deja habilitado al instante: se reintenta sin esperar otro minuto', async () => {
    fakeCountdown()
    const cut = new TypeError('Failed to fetch')
    const action = vi.fn<PlayerLoginAction>().mockResolvedValueOnce(sent()).mockRejectedValue(cut)
    renderForm(action)
    await click('Mandame el enlace')
    await tick(60_000)

    await click('Reenviar enlace')
    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toBe(OFFLINE)
    expect(button('Reenviar enlace').disabled).toBe(false)
    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('cualquier otro rechazo es una falla real: llega a Sentry como evento', async () => {
    const boom = new Error('boom')
    renderForm(vi.fn<PlayerLoginAction>().mockRejectedValue(boom))

    await click('Mandame el enlace')
    await screen.findByRole('alert')

    expect(screen.getByRole('alert').textContent).toBe(OFFLINE)
    expect(Sentry.captureException).toHaveBeenCalledWith(boom)
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled()
  })

  it('una pestaña de antes de un deploy pide recargar, y el email no se pierde', async () => {
    const stale = new UnrecognizedActionError('Server Action "abc123" was not found on the server.')
    renderForm(vi.fn<PlayerLoginAction>().mockRejectedValue(stale))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tomas@example.com' } })

    await click('Mandame el enlace')
    await screen.findByRole('alert')

    expect(screen.getByRole('alert').textContent).toBe(STALE)
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('tomas@example.com')
    // Es un efecto esperable de desplegar, no una falla: sin evento ni breadcrumb.
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled()
  })

  it('un redirect() de la action no se lo traga el catch: llega al borde de Next', async () => {
    const redirectError = (() => {
      try {
        redirect('/otro')
      } catch (error) {
        return error
      }
    })()
    const caught = vi.fn()
    // React avisa por consola del error que atrapa el borde: ruido que acá no dice nada.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false }
      static getDerivedStateFromError() {
        return { failed: true }
      }
      componentDidCatch(error: unknown) {
        caught(error)
      }
      render() {
        return this.state.failed ? null : this.props.children
      }
    }
    try {
      render(
        <Boundary>
          <IngresarForm
            action={vi.fn<PlayerLoginAction>().mockRejectedValue(redirectError)}
            googleAction={vi.fn()}
          />
        </Boundary>,
      )
      await click('Mandame el enlace')
    } finally {
      quiet.mockRestore()
    }

    expect(caught).toHaveBeenCalledWith(redirectError)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled()
  })
})

describe('IngresarForm — Reenviar con el reloj compartido quieto', () => {
  // useNowMs comparte un reloj que deja de andar sin suscriptores. Al volver de "Usar otro email" y
  // reenviar, el primer render puede leer un `now` viejo: sin el tope diría "Reenviar en 150 s".
  it('la primera etiqueta que se pinta no pasa de 60 s', async () => {
    fakeCountdown()
    const labels: string[] = []
    const onRender = () => {
      const resend = screen.queryByRole('button', { name: /^Reenvi/ })
      if (resend) labels.push(resend.textContent ?? '')
    }
    render(
      <Profiler id="reenviar" onRender={onRender}>
        <IngresarForm
          action={vi.fn<PlayerLoginAction>(async () => sent())}
          googleAction={vi.fn()}
        />
      </Profiler>,
    )
    await click('Mandame el enlace')
    await tick(10_000)
    await click('Usar otro email')
    // Sin el panel de "enviado" no hay suscriptores: el reloj compartido queda en t + 10 s.
    vi.setSystemTime(Date.now() + 90_000)
    labels.length = 0
    await click('Mandame el enlace')

    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      expect(Number(/(\d+) s/.exec(label)?.[1] ?? '0')).toBeLessThanOrEqual(60)
    }
  })
})
