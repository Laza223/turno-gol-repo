import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { SignupResult } from './actions'
import { StepCuenta } from './StepCuenta'
import { COMPLEX_ANSWERS } from './signup-draft.fixture'

const meta = {
  title: 'Auth/StepCuenta',
  component: StepCuenta,
  parameters: { layout: 'fullscreen' },
  args: {
    draft: COMPLEX_ANSWERS,
    referralCode: null,
    onBack: fn(),
    signUpAction: fn(async (_input: unknown): Promise<SignupResult> => ({
      ok: false,
      error: 'Ya hay una cuenta con ese mail.',
      field: 'email',
      existing: true,
    })),
    googleAction: fn(async () => ({ ok: false as const, error: 'Google no respondió.' })),
  },
} satisfies Meta<typeof StepCuenta>

export default meta
type Story = StoryObj<typeof meta>

export const DosCaminos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /Continuar con Google/ })).toBeVisible()
    await expect(canvas.getByText('Recomendado · más rápido, sin contraseña')).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Continuar con email/ })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Crear mi cuenta' })).toBeNull()
  },
}

/** Sin celular no se abre Google: el campo explica qué falta. */
export const GoogleSinCelular: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Continuar con Google/ }))
    await expect(await canvas.findByText(/Escribí un celular válido/)).toBeVisible()
    await expect(args.googleAction).not.toHaveBeenCalled()
  },
}

export const GoogleFalla: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Tu celular'), '1144556677')
    await userEvent.click(canvas.getByRole('button', { name: /Continuar con Google/ }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Google no respondió.')
  },
}

/** La contraseña se puede ver, y un mail ya registrado ofrece Ingresar. */
export const MailYaRegistrado: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Tu celular'), '1144556677')
    await userEvent.click(canvas.getByRole('button', { name: /Continuar con email/ }))
    await userEvent.type(canvas.getByLabelText('Tu nombre'), 'Marcelo')
    await userEvent.type(canvas.getByLabelText('Tu email'), 'marcelo@complejo.com')
    await userEvent.type(canvas.getByLabelText('Contraseña'), 'clave-segura-1')
    await expect(canvas.getByLabelText('Contraseña')).toHaveAttribute('type', 'password')
    await userEvent.click(canvas.getByRole('button', { name: 'Mostrar contraseña' }))
    await expect(canvas.getByLabelText('Contraseña')).toHaveAttribute('type', 'text')
    await userEvent.click(canvas.getByRole('button', { name: 'Crear mi cuenta' }))
    await expect(await canvas.findByText('Ya hay una cuenta con ese mail.')).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', '/login')
  },
}

export const CamposVacios: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Tu celular'), '1144556677')
    await userEvent.click(canvas.getByRole('button', { name: /Continuar con email/ }))
    await userEvent.click(canvas.getByRole('button', { name: 'Crear mi cuenta' }))
    await expect(await canvas.findByText('Escribí tu nombre.')).toBeVisible()
  },
}

/** En el navegador de Instagram Google no funciona: va solo el mail y no se promete nada. */
export const NavegadorDeInstagram: Story = {
  args: { inAppBrowser: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/Recomendado/)).toBeNull()
    await expect(canvas.getByLabelText('Tu email')).toBeVisible()
  },
}
