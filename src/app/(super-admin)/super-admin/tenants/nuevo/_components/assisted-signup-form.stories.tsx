import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { AssistedSignupState } from '../../actions'
import { AssistedSignupForm, type AssistedSignupAction } from './assisted-signup-form'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'

// Tipado con la firma de la action: sin esto cada story infiere su propio retorno.
const respond = (state: AssistedSignupState) => fn<AssistedSignupAction>(async () => state)

const meta = {
  title: 'SuperAdmin/Tenants/AssistedSignupForm',
  component: AssistedSignupForm,
  parameters: { layout: 'padded' },
  args: {
    loginUrl: 'http://localhost:3000/login',
    action: respond({
      status: 'success',
      tenantId: TENANT_ID,
      tenantName: 'Canchas del Sur',
      email: 'dueno@canchasdelsur.com',
      tempPassword: 'TG-1a2b3c4d5e',
    }),
  },
} satisfies Meta<typeof AssistedSignupForm>

export default meta
type Story = StoryObj<typeof meta>

export const Vacio: Story = {}

export const AltaOk: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Dar de alta' }))
    await waitFor(() => expect(args.action).toHaveBeenCalledTimes(1))
    await expect(
      await canvas.findByRole('heading', { name: 'Canchas del Sur quedó dado de alta' }),
    ).toBeInTheDocument()
    await expect(canvas.getByText('TG-1a2b3c4d5e')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ver el complejo' })).toHaveAttribute(
      'href',
      `/super-admin/tenants/${TENANT_ID}`,
    )

    // "Dar de alta otro" vuelve al form vacío: la contraseña ya no está en pantalla.
    await userEvent.click(canvas.getByRole('button', { name: 'Dar de alta otro' }))
    await expect(await canvas.findByRole('button', { name: 'Dar de alta' })).toBeInTheDocument()
    await expect(canvas.queryByText('TG-1a2b3c4d5e')).not.toBeInTheDocument()
  },
}

export const EmailDeJugador: Story = {
  args: {
    action: respond({
      status: 'error',
      fieldErrors: {
        email: 'Ese email es de un jugador de TurnoGol. El dueño tiene que usar otro email.',
      },
      values: { name: 'Canchas del Sur', email: 'tomas@gmail.com' },
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Dar de alta' }))
    await expect(
      await canvas.findByText(
        'Ese email es de un jugador de TurnoGol. El dueño tiene que usar otro email.',
      ),
    ).toBeInTheDocument()
    // Lo tipeado vuelve al form: no se pierde por un error.
    await expect(canvas.getByLabelText('Email')).toHaveValue('tomas@gmail.com')
    await expect(canvas.getByRole('button', { name: 'Dar de alta' })).toBeEnabled()
  },
}

export const ErrorGeneral: Story = {
  args: {
    action: respond({
      status: 'error',
      message: 'No se pudo completar el alta. Probá de nuevo en un rato.',
      fieldErrors: {},
      values: {},
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Dar de alta' }))
    await expect(
      await canvas.findByText('No se pudo completar el alta. Probá de nuevo en un rato.'),
    ).toBeInTheDocument()
  },
}
