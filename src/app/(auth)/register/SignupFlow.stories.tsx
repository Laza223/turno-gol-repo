import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { GeocodeAddressAction } from '@/components/maps/LocationPickerField'
import type { SignupResult } from './actions'
import { MotionGlobalConfig } from 'motion/react'
import { SignupFrame } from '@/app/onboarding/components/SignupFrame'
import { SignupFlow } from './SignupFlow'
import { clearSignupDraft, patchSignupDraft } from './signup-draft'
import { COMPLEX_ANSWERS } from './signup-draft.fixture'

/**
 * Las Server Actions entran por prop (ver StepCuenta). El borrador vive en
 * `localStorage`, que las stories comparten: cada una arranca limpiándolo.
 */
const meta = {
  title: 'Auth/SignupFlow',
  component: SignupFlow,
  parameters: { layout: 'fullscreen' },
  // El alta vive siempre sobre el marco oscuro (`(auth)/register/layout.tsx`).
  decorators: [
    (Story) => (
      <SignupFrame>
        <Story />
      </SignupFrame>
    ),
  ],
  // Sin transición entre pantallas: axe mide el contraste del estado final, no el fundido.
  beforeEach: () => {
    clearSignupDraft()
    MotionGlobalConfig.skipAnimations = true
    return () => {
      MotionGlobalConfig.skipAnimations = false
    }
  },
  args: {
    signUpAction: fn(async (_input: unknown): Promise<SignupResult> => ({
      ok: false,
      error: 'Ya hay una cuenta con ese mail.',
      field: 'email',
      existing: true,
    })),
    googleAction: fn(async () => ({ ok: false as const, error: 'Google no respondió.' })),
    geocodeAction: fn<GeocodeAddressAction>(async () => ({
      success: true,
      candidates: [
        {
          label: 'SAN MARTIN 850, Rosario, Santa Fe',
          lat: -32.9473,
          lng: -60.6368,
          city: 'Rosario',
          province: 'Santa Fe',
        },
      ],
    })),
  },
} satisfies Meta<typeof SignupFlow>

export default meta
type Story = StoryObj<typeof meta>

export const ArrancaDeCero: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(async () =>
      expect(
        await canvas.findByRole('heading', { name: '¿Cómo se llama tu complejo?' }),
      ).toBeVisible(),
    )
    await expect(canvas.getByText(/Paso 1 de 4/)).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Atrás' })).toBeVisible()
  },
}

/** De la primera pregunta a la cuenta, y la contraseña nunca llega al borrador. */
export const RecorridoCompleto: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(await canvas.findByRole('textbox'), 'Complejo San Martín')
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))

    await userEvent.type(await canvas.findByRole('textbox'), 'San Martin 850')
    await userEvent.click(canvas.getByRole('button', { name: 'Buscar' }))
    await userEvent.click(await canvas.findByRole('button', { name: /SAN MARTIN 850/ }))
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))

    await waitFor(async () => expect(await canvas.findByText('1 de Fútbol 5')).toBeVisible())
    await expect(canvas.getByText(/Paso 2 de 4/)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Más, canchas de Fútbol 5' }))
    await expect(canvas.getByText('2 de Fútbol 5')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))

    await waitFor(async () =>
      expect(
        await canvas.findByRole('heading', { name: '¿A qué hora abrís y cerrás?' }),
      ).toBeVisible(),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))

    await userEvent.type(await canvas.findByRole('textbox'), '60000')
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))

    await userEvent.click(await canvas.findByRole('radio', { name: 'Por WhatsApp' }))
    await userEvent.click(await canvas.findByRole('radio', { name: 'No' }))
    await userEvent.click(await canvas.findByRole('radio', { name: 'Sí' }))

    await waitFor(async () =>
      expect(await canvas.findByRole('heading', { name: 'Último paso: tu cuenta' })).toBeVisible(),
    )
    await userEvent.type(canvas.getByLabelText('Tu celular'), '1144556677')
    await userEvent.click(canvas.getByRole('button', { name: /Continuar con email/ }))
    await userEvent.type(canvas.getByLabelText('Tu nombre'), 'Marcelo')
    await userEvent.type(canvas.getByLabelText('Tu email'), 'marcelo@complejo.com')
    await userEvent.type(canvas.getByLabelText('Contraseña'), 'clave-segura-1')
    await userEvent.click(canvas.getByRole('button', { name: 'Crear mi cuenta' }))

    await waitFor(() =>
      expect(args.signUpAction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Marcelo',
          email: 'marcelo@complejo.com',
          password: 'clave-segura-1',
          draft: expect.objectContaining({ courts: { '5': 2 }, phone: '+54 1144556677' }),
        }),
      ),
    )
    await expect(localStorage.getItem('tg_signup_draft') ?? '').not.toContain('clave-segura-1')
    await waitFor(async () =>
      expect(await canvas.findByRole('link', { name: 'Ingresar' })).toBeVisible(),
    )
  },
}

/** Quien vuelve (o regresa de Google) retoma donde le faltaba responder. */
export const RetomaEnLaCuenta: Story = {
  beforeEach: () => {
    clearSignupDraft()
    patchSignupDraft(COMPLEX_ANSWERS)
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(async () =>
      expect(await canvas.findByRole('heading', { name: 'Último paso: tu cuenta' })).toBeVisible(),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Atrás' }))
    await waitFor(async () =>
      expect(
        await canvas.findByRole('heading', { name: '¿Cómo tomás los turnos hoy?' }),
      ).toBeVisible(),
    )
  },
}

export const VuelveDeGoogleConMailDeJugador: Story = {
  args: {
    accountError: 'Ese mail ya es de una cuenta de jugador. Usá otro mail para tu complejo.',
  },
  beforeEach: () => {
    clearSignupDraft()
    patchSignupDraft(COMPLEX_ANSWERS)
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('alert')).toHaveTextContent(
      'Ese mail ya es de una cuenta de jugador. Usá otro mail para tu complejo.',
    )
  },
}
