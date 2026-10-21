// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { VerifyView } from '@/app/(auth)/verify/VerifyView'

// Cada código de error de /verify dice qué pasó y qué hacer. El reintento del
// JUGADOR va a /ingresar y /login queda como link chico. `expired`, `invalid` y
// `exchange_failed` los emiten también los links de staff (alta, invitación,
// recovery, email_change), que no traen `via`: sin la marca no sabemos quién es y
// va primero el panel, como siempre.

afterEach(() => cleanup())

const googleAction = vi.fn(async (_formData: FormData) => {})

function renderView(searchParams: Record<string, string>) {
  return render(<VerifyView searchParams={searchParams} googleAction={googleAction} />)
}

describe('VerifyView — códigos compartidos con el staff', () => {
  const SHARED = [
    ['expired', 'Este enlace venció', 'Pedir un enlace nuevo'],
    ['invalid', 'No pudimos leer el enlace', 'Pedir un enlace nuevo'],
    ['exchange_failed', 'No pudimos iniciar tu sesión', 'Volver a intentar'],
    // Un código que no existe (incluso uno heredado de Object.prototype) cae en `invalid`.
    ['constructor', 'No pudimos leer el enlace', 'Pedir un enlace nuevo'],
  ] as const

  it.each(SHARED)(
    '%s CON via (lo pidió un jugador): reintento a /ingresar',
    (error, title, cta) => {
      renderView({ error, via: 'email' })

      expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy()
      expect(screen.getByRole('link', { name: cta }).getAttribute('href')).toBe('/ingresar')
      expect(screen.getByRole('link', { name: 'Entrá al panel' }).getAttribute('href')).toBe(
        '/login',
      )
      expect(screen.queryByText(/no pudimos verificar tu enlace/i)).toBeNull()
    },
  )

  it.each(SHARED)('%s SIN via (no sabemos quién es): primero el panel', (error, title, cta) => {
    renderView({ error })

    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: 'Ingresá acá' }).getAttribute('href')).toBe('/ingresar')
    expect(screen.queryByRole('link', { name: cta })).toBeNull()
  })

  it('una vía inventada cuenta como "sin via"', () => {
    renderView({ error: 'expired', via: 'hacker' })

    expect(screen.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe('/login')
  })

  it.each(['exchange_failed', 'invalid'])(
    '%s con via=google no habla de un enlace: con Google no hubo ninguno',
    (error) => {
      renderView({ error, via: 'google' })

      expect(
        screen.getByRole('heading', { level: 1, name: 'No pudimos iniciar tu sesión' }),
      ).toBeTruthy()
      expect(screen.getByRole('alert').textContent).toContain('Google')
      expect(screen.queryByText(/enlace/i)).toBeNull()
      expect(screen.getByRole('link', { name: 'Volver a intentar' }).getAttribute('href')).toBe(
        '/ingresar',
      )
    },
  )
})

describe('VerifyView — errores solo de jugador', () => {
  it.each([
    ['provision_failed', 'No pudimos terminar de crear tu acceso'],
    ['oauth_cancelled', 'Cancelaste el ingreso con Google'],
    ['oauth_failed', 'Google no pudo completar el ingreso'],
  ])('%s: reintento a /ingresar aunque no traiga via', (error, title) => {
    renderView({ error })

    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Volver a intentar' }).getAttribute('href')).toBe(
      '/ingresar',
    )
    expect(screen.getByRole('link', { name: 'Entrá al panel' }).getAttribute('href')).toBe('/login')
  })

  it('account_conflict con Google: otra cuenta de Google (selector), email, o el panel', async () => {
    renderView({ error: 'account_conflict', via: 'google', next: '/club-x/reservar?court=1' })

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Esta cuenta de Google ya la usa un complejo',
      }),
    ).toBeTruthy()
    // Si el email del complejo es también su Gmail, "entrá con tu Google" lo devolvería
    // al mismo rechazo: el texto tiene que pedir una cuenta que NO sea la del complejo.
    expect(screen.getByRole('alert').textContent).toBe(
      'Para reservar como jugador, entrá con otra cuenta de Google o con un email que no sea el del complejo.',
    )
    // El botón dispara la action de /ingresar con el selector de cuentas y el destino original.
    const button = screen.getByRole('button', { name: 'Usar otra cuenta de Google' })
    expect(button.closest('form')!.querySelector('input[name="select_account"]')).toHaveProperty(
      'value',
      '1',
    )
    fireEvent.click(button)
    await waitFor(() => expect(googleAction).toHaveBeenCalledTimes(1))
    const sent = googleAction.mock.calls[0]![0]
    expect(sent.get('select_account')).toBe('1')
    expect(sent.get('next')).toBe('/club-x/reservar?court=1')
    expect(screen.getByRole('link', { name: 'Entrar con mi email' }).getAttribute('href')).toBe(
      '/ingresar?next=%2Fclub-x%2Freservar%3Fcourt%3D1',
    )
    expect(screen.getByRole('link', { name: 'Entrá al panel' }).getAttribute('href')).toBe('/login')
  })

  it('account_conflict con Google: mientras la action corre avisa "Abriendo Google…" y no admite otro toque', async () => {
    let release!: () => void
    googleAction.mockClear()
    googleAction.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
    renderView({ error: 'account_conflict', via: 'google' })

    fireEvent.click(screen.getByRole('button', { name: 'Usar otra cuenta de Google' }))
    try {
      // Sin señal el jugador no sabe si el toque entró y toca de nuevo.
      const pending = (await screen.findByRole('button', {
        name: 'Abriendo Google…',
      })) as HTMLButtonElement
      expect(pending.disabled).toBe(true)
      expect(pending.getAttribute('aria-busy')).toBe('true')
      // Otro toque arrancaría otro OAuth y pisaría el verifier PKCE del primero.
      fireEvent.click(pending)
      expect(googleAction).toHaveBeenCalledTimes(1)
    } finally {
      release()
    }
    const retry = await screen.findByRole('button', { name: 'Usar otra cuenta de Google' })
    expect((retry as HTMLButtonElement).disabled).toBe(false)
  })

  it('oauth_cancelled no es una falla: ícono neutro y no el rojo de los errores', () => {
    renderView({ error: 'oauth_cancelled' })

    // El ícono vive dentro del badge circular que precede al título.
    const icon = screen.getByRole('heading', { level: 1 }).previousElementSibling!
      .firstElementChild!
    expect(icon.getAttribute('class')).toContain('lucide-info')
    expect(icon.getAttribute('class')).toContain('text-muted-foreground')
    expect(icon.getAttribute('class')).not.toContain('text-red')
  })

  it.each([
    ['oauth_failed', {}],
    ['provision_failed', {}],
    ['account_conflict', { via: 'email' }],
    ['account_conflict', { via: 'google' }],
    ['exchange_failed', { via: 'google' }],
  ])('%s %o sí es una falla: sigue en rojo', (error, extra) => {
    renderView({ error, ...extra })

    // El ícono vive dentro del badge circular que precede al título.
    const icon = screen.getByRole('heading', { level: 1 }).previousElementSibling!
      .firstElementChild!
    expect(icon.getAttribute('class')).toContain('text-red-700')
    expect(icon.getAttribute('class')).not.toContain('lucide-info')
  })

  it.each([
    ['con email', { error: 'account_conflict', via: 'email' }],
    ['sin vía', { error: 'account_conflict' }],
    ['con una vía inventada', { error: 'account_conflict', via: 'hacker' }],
  ])('account_conflict %s: otro email, sin botón de Google', (_name, params) => {
    renderView(params)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Este email ya lo usa un complejo' }),
    ).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe(
      'Para reservar como jugador, entrá con otro email o con una cuenta de Google que no sea la del complejo.',
    )
    expect(screen.getByRole('link', { name: 'Usar otro email' }).getAttribute('href')).toBe(
      '/ingresar',
    )
    expect(screen.getByRole('link', { name: 'Entrá al panel' }).getAttribute('href')).toBe('/login')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('un next malicioso no llega al form ni al link de reintento', () => {
    renderView({ error: 'account_conflict', via: 'google', next: '//evil.com' })

    expect(
      screen
        .getByRole('button', { name: 'Usar otra cuenta de Google' })
        .closest('form')!
        .querySelector<HTMLInputElement>('input[name="next"]')!.value,
    ).toBe('/mis-reservas')
    expect(screen.getByRole('link', { name: 'Entrar con mi email' }).getAttribute('href')).toBe(
      '/ingresar?next=%2Fmis-reservas',
    )
  })

  it('un next repetido (Next lo entrega como string[]) no rompe la pantalla', () => {
    // `?next=a&next=b` llega como array aunque el tipo diga string: `.replace` tiraba TypeError.
    renderView({ error: 'account_conflict', via: 'google', next: ['/a', '/b'] } as never)

    expect(screen.getByRole('link', { name: 'Entrar con mi email' }).getAttribute('href')).toBe(
      '/ingresar?next=%2Fmis-reservas',
    )
  })
})

describe('VerifyView — errores del staff', () => {
  it('orphaned_session conserva su camino a /login', () => {
    renderView({ error: 'orphaned_session' })

    expect(screen.getByRole('heading', { level: 1, name: 'Tu sesión expiró' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: 'Ingresá acá' }).getAttribute('href')).toBe('/ingresar')
  })
})
