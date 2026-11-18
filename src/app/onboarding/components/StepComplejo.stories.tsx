import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { withGeolocation } from '@/test/storybook/with-geolocation'
import type { GeoAddress, GeoLocality } from '@/modules/geo/geo.types'
import type { WizardActionResult } from '../actions'
import { StepComplejo } from './StepComplejo'

const LUJAN: GeoLocality = {
  city: 'Luján',
  province: 'Buenos Aires',
  department: 'Partido de Luján',
  lat: -34.5703,
  lng: -59.105,
  source: 'dataset',
}
const MITRE: GeoAddress = {
  label: 'Bartolomé Mitre 800, Luján, Buenos Aires',
  address: 'Bartolomé Mitre 800',
  city: 'Luján',
  province: 'Buenos Aires',
  lat: -34.5701,
  lng: -59.1049,
  source: 'georef',
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
  },
} satisfies Meta<typeof StepComplejo>

export default meta
type Story = StoryObj<typeof meta>

async function typeName(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  await userEvent.type(canvas.getByLabelText(/nombre del complejo/i), 'Complejo San Martín')
  await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
}

async function elegirLocalidad(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  await userEvent.type(await canvas.findByRole('combobox', { name: 'Localidad' }), 'lujan')
  await userEvent.click(
    await within(canvasElement.ownerDocument.body).findByRole('option', { name: /Luján/ }),
  )
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

/** Pantalla 2: localidad, calle y altura; se elige un resultado y se guarda con su ciudad y provincia. */
export const BuscarYElegirDireccion: Story = {
  parameters: {
    fetchMock: [
      { match: '/api/public/geo/localidades', json: { results: [LUJAN] } },
      { match: '/api/public/geo/direcciones', json: { results: [MITRE] } },
    ],
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await typeName(canvasElement)
    await expect(
      await canvas.findByRole('heading', { name: '¿Dónde queda Complejo San Martín?' }),
    ).toBeVisible()

    await elegirLocalidad(canvasElement)
    await userEvent.type(canvas.getByLabelText('Calle y altura'), 'Mitre 800{Enter}')
    await userEvent.click(await canvas.findByRole('button', { name: MITRE.label }))
    await expect(canvas.getByText('Luján, Buenos Aires')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(args.action).toHaveBeenCalledTimes(1))
    const formData = firstFormData(args.action)
    await expect(formData.get('name')).toBe('Complejo San Martín')
    await expect(formData.get('address')).toBe('Bartolomé Mitre 800')
    await expect(formData.get('city')).toBe('Luján')
    await expect(formData.get('province')).toBe('Buenos Aires')
    await expect(formData.get('latitude')).toBe(String(MITRE.lat))
  },
}

/** La calle no aparece: se usa "tal cual", con el centro de la localidad. */
export const SinResultadosTalCual: Story = {
  parameters: {
    fetchMock: [
      { match: '/api/public/geo/localidades', json: { results: [LUJAN] } },
      { match: '/api/public/geo/direcciones', json: { results: [] } },
    ],
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await typeName(canvasElement)
    await elegirLocalidad(canvasElement)
    await userEvent.type(await canvas.findByLabelText('Calle y altura'), 'Calle Rara 12{Enter}')
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Usar «Calle Rara 12» tal cual' }),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))

    await waitFor(() => expect(args.action).toHaveBeenCalledTimes(1))
    const formData = firstFormData(args.action)
    await expect(formData.get('address')).toBe('Calle Rara 12')
    await expect(formData.get('city')).toBe('Luján')
    await expect(formData.get('latitude')).toBe(String(LUJAN.lat))
  },
}

/** "Usar mi ubicación actual": el GPS completa la dirección. */
export const UsarMiUbicacion: Story = {
  decorators: [withGeolocation('found')],
  parameters: {
    fetchMock: [
      {
        match: '/api/public/geo/reverse',
        json: {
          result: {
            city: 'Luján',
            province: 'Buenos Aires',
            address: 'Bartolomé Mitre 800',
            lat: MITRE.lat,
            lng: MITRE.lng,
          },
        },
      },
    ],
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await typeName(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /Usar mi ubicación actual/ }))
    await expect(await canvas.findByText('Bartolomé Mitre 800')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Siguiente' }))

    await waitFor(() => expect(args.action).toHaveBeenCalledTimes(1))
    await expect(firstFormData(args.action).get('address')).toBe('Bartolomé Mitre 800')
  },
}

/** Sin dirección completa no se guarda nada. */
export const SinElegirDireccion: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await typeName(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Siguiente' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/buscá tu dirección/i)
    await expect(args.action).not.toHaveBeenCalled()
  },
}

/** Revisita desde el resumen: viene cargado y el link no cambia. */
export const Revisita: Story = {
  args: {
    defaultValues: {
      name: 'Complejo Fénix',
      address: 'Bartolomé Mitre 800',
      city: 'Luján',
      province: 'Buenos Aires',
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
