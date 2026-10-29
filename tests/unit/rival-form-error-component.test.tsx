// @vitest-environment happy-dom
//
// Los errores que necesitan una salida (sesión vencida, tope) la traen en TODAS las vistas que los
// muestran, no solo en los forms: el "Voy" y el "Pedir sumarme" directos, "Avisame" y la publicación.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RivalFormResult } from '@/app/(player)/rival/actions'
import { AlertOptIn } from '@/app/(player)/rival/AlertOptIn'
import { BoardFields } from '@/app/(player)/rival/BoardFields'
import { VoyPanel } from '@/app/(player)/rival/p/[code]/VoyPanel'
import { RequestPanel } from '@/app/(player)/rival/partido/[id]/RequestPanel'

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/rival/p/ABCDEFGHJK',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(cleanup)

const failing = (error: string, code?: string) =>
  vi.fn(async (): Promise<RivalFormResult> => ({
    success: false,
    error,
    ...(code ? { code } : {}),
  }))
const form = vi.fn(async (): Promise<RivalFormResult> => ({ success: true }))

describe('"Voy" directo', () => {
  it('con la sesión vencida ofrece "Ingresar"', async () => {
    render(
      <VoyPanel
        code="ABCDEFGHJK"
        welcome={null}
        autoJoin={false}
        openWelcome={false}
        intentParam="rival_intent"
        joinAction={failing('Ingresá a tu cuenta para seguir.', 'no_session')}
        acceptAndJoinAction={form}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Voy' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Ingresá a tu cuenta para seguir.')
    expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe(
      '/ingresar?next=%2Frival%2Fp%2FABCDEFGHJK',
    )
  })
})

describe('"Pedir sumarme" directo', () => {
  it('con el tope de pedidos manda a "Ver mis partidos"', async () => {
    render(
      <RequestPanel
        matchId="m1"
        label="Pedir sumarme"
        welcome={null}
        requestAction={failing('Ya tenés 5 pedidos pendientes.', 'rival_limit_requests')}
        acceptAndRequestAction={form}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pedir sumarme' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Ya tenés 5 pedidos pendientes.')
    expect(screen.getByRole('link', { name: 'Ver mis partidos' }).getAttribute('href')).toBe(
      '/rival/mis-partidos',
    )
  })
})

describe('"Avisame"', () => {
  it('con la sesión vencida ofrece "Ingresar"', async () => {
    render(
      <AlertOptIn
        tenants={[{ id: 't1', name: 'El Vagón' }]}
        signedIn
        subscribed={[]}
        action={failing('Ingresá a tu cuenta para seguir.', 'no_session')}
        unsubscribeAction={form}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Avisarme por mail' }))
    expect(await screen.findByRole('link', { name: 'Ingresar' })).toBeTruthy()
  })
})

describe('BoardFields', () => {
  it('con dos errores de campo, solo el primero es alert', () => {
    const errors: Record<string, string> = {
      whatsapp: 'Ingresá tu WhatsApp.',
      whatsappConsent: 'Marcá la casilla para publicar.',
    }
    render(
      <BoardFields
        idPrefix="publicar"
        seeking="rival"
        onSeekingChange={vi.fn()}
        position="any"
        onPositionChange={vi.fn()}
        whatsapp=""
        onWhatsappChange={vi.fn()}
        consent={false}
        onConsentChange={vi.fn()}
        fieldError={(f) => errors[f]}
      />,
    )
    expect(screen.getByText('Marcá la casilla para publicar.')).toBeTruthy()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toBe('Ingresá tu WhatsApp.')
  })
})
