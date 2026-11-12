import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { pendingAction } from '@/test/pending-action'
import type { SignupResult } from './actions'
import { FinalizarSignup } from './FinalizarSignup'
import { clearSignupDraft, patchSignupDraft } from './signup-draft'
import { COMPLEX_ANSWERS } from './signup-draft.fixture'

const withDraft = () => {
  clearSignupDraft()
  patchSignupDraft({ ...COMPLEX_ANSWERS, phone: '+541144556677' })
}

const meta = {
  title: 'Auth/FinalizarSignup',
  component: FinalizarSignup,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => clearSignupDraft(),
} satisfies Meta<typeof FinalizarSignup>

export default meta
type Story = StoryObj<typeof meta>

/** Otro celular o storage limpio: se explica y se manda a empezar. */
export const SinBorrador: Story = {
  args: { action: fn(async (_input: unknown): Promise<SignupResult> => ({ ok: true, path: '/' })) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByRole('heading', { name: 'No encontramos las respuestas de tu complejo' }),
    ).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Cargar mi complejo' })).toHaveAttribute(
      'href',
      '/register',
    )
    await expect(args.action).not.toHaveBeenCalled()
  },
}

const enCurso = pendingAction<SignupResult>({ ok: false, error: 'No se pudo.', field: 'form' })

export const Creando: Story = {
  args: { action: fn(enCurso.action) },
  beforeEach: withDraft,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Creando tu complejo')).toBeVisible()
    await expect(args.action).toHaveBeenCalledTimes(1)
    await enCurso.release()
  },
}

export const Falla: Story = {
  args: {
    action: fn(async (_input: unknown): Promise<SignupResult> => ({
      ok: false,
      error: 'Ese mail ya es de una cuenta de jugador. Usá otro mail para tu complejo.',
      field: 'form',
    })),
  },
  beforeEach: withDraft,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Ese mail ya es de una cuenta')
    await userEvent.click(canvas.getByRole('button', { name: 'Intentar de nuevo' }))
  },
}
