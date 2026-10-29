// @vitest-environment happy-dom
//
// La bienvenida en dos momentos con React REAL y la action como mock: solo se manda lo que se pinta
// (el servidor decide qué falta), una action que rechaza no tira la tarjeta y "Ahora no" no envía.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { RivalFormResult } from '@/app/(player)/rival/actions'
import { WelcomeCard } from '@/app/(player)/rival/WelcomeCard'

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/rival/nuevo',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(cleanup)

type Action = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>

function renderCard(
  needs: { identity: boolean; profile: boolean; position: boolean },
  over: {
    action?: Action
    onDismiss?: () => void
    focusOnMount?: boolean
    pinSubmit?: boolean
  } = {},
) {
  const action = vi.fn<Action>(over.action ?? (async () => ({ success: true })))
  render(
    <WelcomeCard
      needs={needs}
      defaultName="Lazaro"
      defaultZone="Luján"
      action={action}
      submitLabel="Seguir"
      hidden={{ code: 'ABCDEFGHJK' }}
      onDismiss={over.onDismiss}
      focusOnMount={over.focusOnMount}
      pinSubmit={over.pinSubmit}
    />,
  )
  return action
}

const sentKeys = (action: ReturnType<typeof renderCard>) =>
  [...(action.mock.calls[0]![1] as FormData).keys()].sort()

describe('WelcomeCard: solo se manda lo que se pinta', () => {
  it.each([
    [{ identity: true, profile: false, position: false }, ['code', 'firstName']],
    [{ identity: false, profile: true, position: true }, ['code', 'position', 'zone']],
    [{ identity: true, profile: true, position: true }, ['code', 'firstName', 'position', 'zone']],
    // Capitán de un equipo rival: la posición no se pinta ni se manda.
    [{ identity: false, profile: true, position: false }, ['code', 'zone']],
    [{ identity: true, profile: true, position: false }, ['code', 'firstName', 'zone']],
  ])('%j', async (needs, keys) => {
    const action = renderCard(needs)
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(sentKeys(action)).toEqual(keys)
  })

  it('solo perfil: la zona de antes llega precargada y no hay nombre ni reglas', async () => {
    const action = renderCard({ identity: false, profile: true, position: true })
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect((action.mock.calls[0]![1] as FormData).get('zone')).toBe('Luján')
    expect(screen.queryByLabelText('Tu nombre')).toBeNull()
    expect(screen.queryByText('Las reglas de RIVAL')).toBeNull()
  })
})

describe('WelcomeCard: textos por momento', () => {
  it('identidad: la frase del organizador no está', () => {
    renderCard({ identity: true, profile: false, position: false })
    expect(screen.getByText(/Al tocar, aceptás las reglas de RIVAL/)).toBeTruthy()
    expect(screen.queryByText(/El organizador ve además/)).toBeNull()
  })

  it('identidad y perfil: la frase del organizador está en el párrafo', () => {
    renderCard({ identity: true, profile: true, position: true })
    expect(screen.getByText(/Al tocar, aceptás las reglas de RIVAL/).textContent).toContain(
      'El organizador ve además tu posición y tu zona.',
    )
  })

  it('solo perfil: la bajada del jugador habla de armar equipos; la del capitán, solo de la zona', () => {
    renderCard({ identity: false, profile: true, position: true })
    expect(
      screen.getByText(
        'Elegí tu posición y tu zona. El organizador las usa para armar los equipos. Lo pedimos una sola vez.',
      ),
    ).toBeTruthy()
    cleanup()
    renderCard({ identity: false, profile: true, position: false })
    expect(
      screen.getByText(
        'Elegí tu zona. El organizador la ve para coordinar el partido. Lo pedimos una sola vez.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/armar los equipos/)).toBeNull()
    expect(screen.queryByLabelText('Tu posición')).toBeNull()
    expect(document.querySelector('[name="position"]')).toBeNull()
    expect(screen.getByText(/El organizador ve además tu posición y tu zona\./)).toBeTruthy()
  })

  it('la posición es un select en todas las variantes (nunca chips)', () => {
    for (const needs of [
      { identity: true, profile: true, position: true },
      { identity: false, profile: true, position: true },
    ]) {
      renderCard(needs)
      expect(screen.getByLabelText('Tu posición')).toBeTruthy()
      expect(screen.queryByRole('radiogroup')).toBeNull()
      expect(document.querySelectorAll('[name="position"]')).toHaveLength(1)
      cleanup()
    }
  })

  it('solo perfil: otro título y sin "Al tocar, aceptás"', () => {
    renderCard({ identity: false, profile: true, position: true })
    expect(screen.getByRole('heading', { name: 'Un dato más para sumarte' })).toBeTruthy()
    expect(screen.queryByText(/Al tocar, aceptás/)).toBeNull()
    // La frase del organizador se dice una sola vez; lo que ya aceptó no se repite.
    expect(screen.getAllByText(/El organizador ve además tu posición y tu zona/)).toHaveLength(1)
    expect(screen.getByText(/El organizador las usa para armar los equipos/)).toBeTruthy()
  })
})

describe('WelcomeCard: grupos y aviso de visibilidad', () => {
  it('con identidad y perfil el único título es el del organizador: no se repite "Quién sos"', () => {
    renderCard({ identity: true, profile: true, position: true })
    expect(screen.getByRole('group', { name: 'Para el organizador' })).toBeTruthy()
    expect(screen.queryByText('Quién sos')).toBeNull()
    expect(screen.getAllByRole('group')).toHaveLength(1)
  })

  it('pinSubmit: la barra fija lleva la línea corta y el botón; el consentimiento completo sigue en el flujo', () => {
    renderCard({ identity: true, profile: true, position: true }, { pinSubmit: true })
    const bar = document.querySelector('[data-fixed-cta]')!
    expect(bar.textContent).toContain('Al tocar, aceptás las reglas de RIVAL.')
    expect(bar.querySelector('button[type="submit"]')?.textContent).toBe('Seguir')
    expect(document.querySelectorAll('[data-fixed-cta] button')).toHaveLength(1)
    const full = screen.getByText(/Quien tenga el link de un partido/)
    expect(bar.contains(full)).toBe(false)
    expect(screen.getByText('Las reglas de RIVAL')).toBeTruthy()
    expect(screen.getAllByText('Llegá a horario.')).toHaveLength(1)
  })

  it('pinSubmit sin identidad: la barra no estampa consentimiento', () => {
    renderCard({ identity: false, profile: true, position: true }, { pinSubmit: true })
    const bar = document.querySelector('[data-fixed-cta]')!
    expect(bar.textContent).not.toContain('Al tocar')
    expect(bar.querySelector('button[type="submit"]')).not.toBeNull()
  })

  it('pinSubmit: el botón fijo envía el form', async () => {
    const action = renderCard(
      { identity: false, profile: true, position: true },
      { pinSubmit: true },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
  })

  it('con un solo momento no hay grupos sin nombre', () => {
    renderCard({ identity: true, profile: false, position: false })
    expect(screen.queryAllByRole('group')).toHaveLength(0)
  })

  it('el aviso dice que ve el link de un partido en el que estés', () => {
    renderCard({ identity: true, profile: false, position: false })
    expect(document.body.textContent).toContain(
      'Quien tenga el link de un partido en el que estés y haya iniciado sesión ve tu nombre corto y tu foto.',
    )
  })
})

describe('WelcomeCard: salida, foco y red', () => {
  it('"Ahora no" avisa al padre y no envía nada', () => {
    const onDismiss = vi.fn()
    const action = renderCard({ identity: true, profile: false, position: false }, { onDismiss })
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(action).not.toHaveBeenCalled()
  })

  it('con la zona sin elegir, el error se pinta y el foco va al botón de la zona', async () => {
    renderCard(
      { identity: false, profile: true, position: true },
      {
        action: async () => ({
          success: false,
          error: 'Elegí tu zona',
          fieldErrors: { zone: 'Elegí tu zona' },
        }),
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Elegí tu zona')
    await waitFor(() => expect(document.activeElement?.id).toBe('rival-zona'))
  })

  it('sin onDismiss ni dismissHref no hay "Ahora no"', () => {
    renderCard({ identity: true, profile: false, position: false })
    expect(screen.queryByText('Ahora no')).toBeNull()
  })

  it('con focusOnMount el foco va al título y no al nombre', () => {
    renderCard({ identity: true, profile: false, position: false }, { focusOnMount: true })
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Bienvenido a RIVAL' }))
  })

  it('sin focusOnMount el título no es enfocable', () => {
    renderCard({ identity: true, profile: false, position: false })
    expect(
      screen.getByRole('heading', { name: 'Bienvenido a RIVAL' }).hasAttribute('tabindex'),
    ).toBe(false)
  })

  it('si la action rechaza, el error sale en la tarjeta y lo tipeado queda', async () => {
    renderCard(
      { identity: true, profile: false, position: false },
      {
        action: async () => {
          throw new Error('Failed to fetch')
        },
      },
    )
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Tomás' } })
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'No pudimos conectar. Revisá tu conexión y probá de nuevo.',
    )
    expect((screen.getByLabelText('Tu nombre') as HTMLInputElement).value).toBe('Tomás')
  })

  it('los dos errores de campo salen juntos', async () => {
    renderCard(
      { identity: true, profile: true, position: true },
      {
        action: async () => ({
          success: false,
          error: 'Ingresá tu nombre.',
          field: 'firstName',
          fieldErrors: { firstName: 'Ingresá tu nombre.', zone: 'Elegí tu zona' },
        }),
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    expect(await screen.findByText('Elegí tu zona')).toBeTruthy()
    expect(screen.getByText('Ingresá tu nombre.')).toBeTruthy()
    // Un solo alert (el primer campo con error); el otro mensaje es un <p> común.
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toBe('Ingresá tu nombre.')
    expect(screen.getByLabelText('Tu nombre').getAttribute('aria-invalid')).toBe('true')
  })

  it('un error de un campo que la tarjeta no dibuja sale abajo del botón, no se pierde', async () => {
    renderCard(
      { identity: false, profile: true, position: true },
      {
        action: async () => ({
          success: false,
          error: 'Ingresá tu nombre.',
          field: 'firstName',
          fieldErrors: { firstName: 'Ingresá tu nombre.' },
        }),
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Ingresá tu nombre.')
  })

  it('sesión vencida: el error ofrece "Ingresar"', async () => {
    renderCard(
      { identity: true, profile: false, position: false },
      {
        action: async () => ({
          success: false,
          error: 'Ingresá a tu cuenta para seguir.',
          code: 'no_session',
        }),
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    const link = await screen.findByRole('link', { name: 'Ingresar' })
    expect(link.getAttribute('href')).toBe('/ingresar?next=%2Frival%2Fnuevo')
  })
})
