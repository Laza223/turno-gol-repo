import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { WizardActionResult } from '../actions'
import type { GeocodeAddressAction } from '@/components/maps/LocationPickerField'
import { StepComplejo } from './StepComplejo'

const CANDIDATE = {
  label: 'SAN MARTIN 850, Rosario, Santa Fe',
  lat: -32.9473,
  lng: -60.6368,
  city: 'Rosario',
  province: 'Santa Fe',
}

/**
 * Las Server Actions entran por prop. `fullscreen`: el paso arma su propio
 * `<WizardShell>` (la card), y la barra de acciones es fija abajo en el celular.
 */
const meta = {
  title: 'Onboarding/StepComplejo',
  component: StepComplejo,
  parameters: { layout: 'fullscreen' },
  args: {
    action: fn(async (): Promise<WizardActionResult> => ({
      success: true,
      next: '/onboarding/canchas',
    })),
    geocodeAction: fn<GeocodeAddressAction>(async () => ({
      success: true,
      candidates: [CANDIDATE],
    })),
  },
} satisfies Meta<typeof StepComplejo>

export default meta
type Story = StoryObj<typeof meta>

async function typeName(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  await userEvent.type(canvas.getByLabelText(/nombre del complejo/i), 'Complejo San Martín')
  await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
}

function firstFormData(action: unknown): FormData {
  const calls = (action as { mock: { calls: unknown[][] } }).mock.calls
  return calls[0]?.[1] as FormData
}

/** Pantalla 1: el nombre, con el link que se arma solo. */
export const Nombre: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: '¿Cómo se llama tu complejo?' })).toBeVisible()
    await userEvent.type(canvas.getByLabelText(/nombre del complejo/i), 'Complejo San Martín')
    await expect(canvas.getByText('complejo-san-martin')).toBeInTheDocument()
  },
}

/** Sin nombre no pasa a la pantalla siguiente. */
export const NombreVacio: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/escribí el nombre/i)
    await expect(canvas.queryByRole('heading', { name: /dónde queda/i })).toBeNull()
  },
}

/** Pantalla 2: se busca la dirección, se elige un candidato y se guarda con ciudad y provincia de Georef. */
export const BuscarYElegirDireccion: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await typeName(canvasElement)
    await expect(
      await canvas.findByRole('heading', { name: '¿Dónde queda Complejo San Martín?' }),
    ).toBeVisible()

    await userEvent.type(canvas.getByLabelText(/buscar dirección/i), 'San Martin 850')
    await userEvent.click(canvas.getByRole('button', { name: /buscar/i }))
    await userEvent.click(await canvas.findByRole('button', { name: CANDIDATE.label }))
    await expect(canvas.getByText('Rosario, Santa Fe')).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(args.action).toHaveBeenCalledTimes(1))
    const formData = firstFormData(args.action)
    await expect(formData.get('name')).toBe('Complejo San Martín')
    await expect(formData.get('address')).toBe('San Martin 850')
    await expect(formData.get('city')).toBe('Rosario')
    await expect(formData.get('province')).toBe('Santa Fe')
    await expect(formData.get('latitude')).toBe(String(CANDIDATE.lat))
  },
}

/** Sin elegir un candidato no se guarda nada. */
export const SinElegirDireccion: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await typeName(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Siguiente' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/buscá tu dirección/i)
    await expect(args.action).not.toHaveBeenCalled()
  },
}

/** Georef no responde: queda la salida de escribir ciudad y provincia a mano. */
export const GeorefCaido: Story = {
  args: {
    geocodeAction: fn<GeocodeAddressAction>(async () => ({
      success: false,
      error: 'no disponible',
    })),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await typeName(canvasElement)
    await userEvent.type(await canvas.findByLabelText(/buscar dirección/i), 'Mitre 100')
    await userEvent.click(canvas.getByRole('button', { name: /buscar/i }))
    await expect(await canvas.findByText(/no pudimos buscar ahora/i)).toBeInTheDocument()

    await userEvent.click(
      canvas.getByRole('button', { name: /escribir ciudad y provincia a mano/i }),
    )
    await userEvent.type(canvas.getByLabelText('Dirección'), 'Mitre 100')
    await userEvent.type(canvas.getByLabelText('Ciudad'), 'Rosario')
    await userEvent.click(canvas.getByRole('combobox', { name: /provincia/i }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('option', { name: 'Santa Fe' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))

    await waitFor(() => expect(args.action).toHaveBeenCalledTimes(1))
    const formData = firstFormData(args.action)
    await expect(formData.get('city')).toBe('Rosario')
    await expect(formData.get('province')).toBe('Santa Fe')
    await expect(formData.get('latitude')).toBe('')
  },
}

/** Revisita desde el resumen: viene cargado y el link no cambia. */
export const Revisita: Story = {
  args: {
    defaultValues: {
      name: 'Complejo Fénix',
      address: 'Mitre 100',
      city: 'Rosario',
      province: 'Santa Fe',
      slug: 'complejo-fenix',
      latitude: null,
      longitude: null,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText(/nombre del complejo/i)).toHaveValue('Complejo Fénix')
    await expect(canvas.getByText(/no cambia aunque cambies el nombre/i)).toBeInTheDocument()
  },
}
