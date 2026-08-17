import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { generateSlug } from '@/modules/tenants/tenant.utils'
import { pendingAction } from '@/test/pending-action'
import { StepIdentity, type CreateTenantAction } from './StepIdentity'

/**
 * Queda en vuelo para mantener el botón en carga; el `play` la libera al final.
 *
 * Antes esto era un `() => new Promise(() => {})` con una variable local llamada
 * `pendingAction` — el falso amigo que hacía que un grep por nombre lo contara
 * como migrado sin estarlo.
 */
const enviandoIdentidad = pendingAction<Awaited<ReturnType<CreateTenantAction>>>({
  success: true as const,
})

/**
 * La Server Action entra por prop (ver comentario en el componente). Desde el
 * split panel (Fase 3), `StepIdentity` arma su propio `<WizardShell>` —trae
 * rail + preview (`PublicCardPreview`)—, así que la story es `fullscreen` y ya
 * no necesita fingir el `card-premium` con un decorator: el shell lo pone solo.
 */
const meta = {
  title: 'Onboarding/StepIdentity',
  component: StepIdentity,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof StepIdentity>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Provincia es un `Combobox` (Fase 4, reemplaza el `<select>` de 24 opciones):
 * abrir, elegir la opción por texto. El panel va portaled a `document.body`
 * (Radix Popover), fuera de `canvasElement` — mismo patrón que
 * `combobox.stories.tsx`.
 */
async function pickProvince(canvasElement: HTMLElement, name: string) {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('combobox', { name: /provincia/i }))
  const body = within(canvasElement.ownerDocument.body)
  await waitFor(() => expect(body.getByRole('option', { name })).toBeVisible())
  await userEvent.click(body.getByRole('option', { name }))
}

async function fillRequiredFields(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  await userEvent.type(canvas.getByLabelText(/nombre del complejo/i), 'Complejo San Martín')
  await userEvent.type(canvas.getByLabelText(/dirección/i), 'Av. Corrientes 1234')
  await userEvent.type(canvas.getByLabelText(/ciudad/i), 'Luján')
  await pickProvince(canvasElement, 'Buenos Aires')
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

/**
 * El preview (`PublicCardPreview`, columna derecha en desktop) se arma EN VIVO:
 * antes `address`/`city` eran `defaultValue` sueltos y no alimentaban nada; ahora
 * son controlados y el nombre tipeado aparece ahí apenas se escribe, sin esperar
 * al submit.
 */
export const PreviewDeLaTarjetaEnVivo: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Sin nombre, la tarjeta muestra el placeholder — nunca inventa un dato.
    // getAllBy: PublicCardPreview vive dos veces en el DOM (aside desktop +
    // panel mobile de PreviewPane), mismo patrón que el indicador de progreso.
    await expect(canvas.getAllByText('Así te van a ver los jugadores.').length).toBeGreaterThan(0)

    await userEvent.type(canvas.getByLabelText(/nombre del complejo/i), 'Complejo San Martín')
    await userEvent.type(canvas.getByLabelText(/dirección/i), 'Av. Corrientes 1234')
    await userEvent.type(canvas.getByLabelText(/ciudad/i), 'Luján')

    await expect(canvas.getAllByText('Complejo San Martín').length).toBeGreaterThan(0)
    await expect(canvas.getAllByText('Av. Corrientes 1234 · Luján').length).toBeGreaterThan(0)
  },
}

export const ErrorDelServidor: Story = {
  args: {
    action: fn(async () => ({ success: false as const, error: 'Ese nombre ya está en uso.' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fillRequiredFields(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /continuar/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Ese nombre ya está en uso.')
  },
}

/**
 * Revisita con "Volver" desde Horarios: el complejo ya existe, así que el paso
 * edita en vez de crear. El link público NO se recalcula — se fijó al crear y
 * para acá ya pudo viajar por WhatsApp. Sin `phone`/`email`: desde la Fase 4
 * este paso ya no los pide (se editan en `/settings/perfil`).
 */
export const RevisitaEditando: Story = {
  args: {
    action: fn(async () => ({ success: true as const })),
    defaultValues: {
      name: 'Complejo San Martín',
      address: 'Av. Corrientes 1234',
      city: 'Luján',
      province: 'Buenos Aires',
      slug: 'complejo-san-martin-lujan',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText(/nombre del complejo/i)).toHaveValue('Complejo San Martín')
    await expect(canvas.getByLabelText(/ciudad/i)).toHaveValue('Luján')
    await expect(canvas.getByRole('button', { name: /guardar y continuar/i })).toBeInTheDocument()

    // El slug guardado, no el derivado del nombre nuevo.
    await userEvent.clear(canvas.getByLabelText(/nombre del complejo/i))
    await userEvent.type(canvas.getByLabelText(/nombre del complejo/i), 'Otro nombre')
    await expect(canvas.getByText('complejo-san-martin-lujan')).toBeInTheDocument()
    await expect(canvas.queryByText(generateSlug('Otro nombre'))).not.toBeInTheDocument()
  },
}

export const Enviando: Story = {
  args: { action: fn(enviandoIdentidad.action) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fillRequiredFields(canvasElement)
    const submit = canvas.getByRole('button', { name: /continuar/i })
    await userEvent.click(submit)
    await expect(submit).toBeDisabled()
    // Última story del archivo: hoy es segura por posición, no por diseño.
    await enviandoIdentidad.release(submit)
  },
}
