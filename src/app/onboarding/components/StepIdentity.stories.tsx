import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { generateSlug } from '@/modules/tenants/tenant.utils'
import { StepIdentity, type CreateTenantAction } from './StepIdentity'

/** Nunca resuelve: mantiene el botón en estado de carga a propósito. */
const pendingAction: CreateTenantAction = () => new Promise(() => {})

/** La Server Action entra por prop (ver comentario en el componente). */
const meta = {
  title: 'Onboarding/StepIdentity',
  component: StepIdentity,
  parameters: { layout: 'padded' },
  // Paso 1 vive dentro de `.card-premium rounded-2xl p-6 md:p-8` (ver page.tsx del wizard).
  decorators: [
    (Story) => (
      <div className="card-premium max-w-lg rounded-2xl p-6 md:p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StepIdentity>

export default meta
type Story = StoryObj<typeof meta>

async function fillRequiredFields(canvas: ReturnType<typeof within>) {
  await userEvent.type(canvas.getByLabelText(/nombre del complejo/i), 'Complejo San Martín')
  await userEvent.type(canvas.getByLabelText(/dirección/i), 'Av. Corrientes 1234')
  await userEvent.type(canvas.getByLabelText(/ciudad/i), 'Luján')
  await userEvent.selectOptions(canvas.getByLabelText(/provincia/i), 'Buenos Aires')
  await userEvent.type(canvas.getByLabelText(/teléfono/i), '1122334455')
  await userEvent.type(canvas.getByLabelText(/email de contacto/i), 'hola@complejo.com')
}

/** Sin nombre cargado (o <2 chars): todavía no hay preview del link público. */
export const SinPreview: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/turnogol\.app\/c\//)).not.toBeInTheDocument()
  },
}

/** Nombre >=2 chars: aparece el preview `turnogol.app/<slug>`. */
export const ConPreviewDeLink: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText(/nombre del complejo/i), 'Complejo San Martín')
    await expect(canvas.getByText(generateSlug('Complejo San Martín'))).toBeInTheDocument()
  },
}

export const ErrorDelServidor: Story = {
  args: {
    action: fn(async () => ({ success: false as const, error: 'Ese nombre ya está en uso.' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fillRequiredFields(canvas)
    await userEvent.click(canvas.getByRole('button', { name: /continuar/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Ese nombre ya está en uso.')
  },
}

export const Enviando: Story = {
  args: { action: fn(pendingAction) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fillRequiredFields(canvas)
    const submit = canvas.getByRole('button', { name: /continuar/i })
    await userEvent.click(submit)
    await expect(submit).toBeDisabled()
  },
}
