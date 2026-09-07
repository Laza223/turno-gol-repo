import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { TenantLocationForm } from './TenantLocationForm'

/**
 * Única pantalla que edita dirección, ciudad, provincia y el punto del mapa.
 *
 * Hasta que existió, esos cuatro datos sólo se pedían en el paso 1 del wizard y
 * después quedaban congelados: una dirección mal tipeada no tenía arreglo, y
 * las coordenadas nunca se cargaban en toda la aplicación.
 *
 * La action entra por prop: `'use server'` importado como valor arrastra
 * drizzle y postgres al bundle del navegador. Los tiles del mapa los pisa el
 * decorator global `withOfflineTiles`.
 */
const meta = {
  title: 'Settings/Perfil/TenantLocationForm',
  component: TenantLocationForm,
  parameters: { layout: 'padded' },
  args: {
    currentAddress: 'Av. Pellegrini 1250',
    currentCity: 'Rosario',
    currentProvince: 'Santa Fe',
    currentLatitude: null,
    currentLongitude: null,
  },
} satisfies Meta<typeof TenantLocationForm>

export default meta
type Story = StoryObj<typeof meta>

/** El estado real de todos los complejos de producción: sin punto cargado. */
export const SinUbicacionCargada: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText(/dirección/i)).toHaveValue('Av. Pellegrini 1250')
    await expect(canvas.getByText(/Sin ubicación marcada/i)).toBeInTheDocument()
    const latitud = canvasElement.querySelector<HTMLInputElement>('input[name="latitude"]')
    await expect(latitud?.value).toBe('')
  },
}

export const ConPuntoCargado: Story = {
  args: {
    currentLatitude: -32.9468,
    currentLongitude: -60.6393,
    action: fn(async () => ({ success: true as const })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Punto marcado en/i)).toBeInTheDocument()
    const longitud = canvasElement.querySelector<HTMLInputElement>('input[name="longitude"]')
    await expect(longitud?.value).toBe('-60.6393')
  },
}

/** La provincia viaja por input oculto: el Combobox no es un control nativo. */
export const LaProvinciaViajaPorInputOculto: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const provincia = canvasElement.querySelector<HTMLInputElement>('input[name="province"]')
    await expect(provincia?.value).toBe('Santa Fe')
  },
}

export const ErrorDelServidor: Story = {
  args: {
    action: fn(async () => ({ success: false as const, error: 'Dirección muy corta' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Guardar ubicación/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Dirección muy corta')
  },
}

/**
 * El mensaje de éxito no puede aparecer antes de que el dueño toque nada:
 * `state.success` arranca en `true`, por eso el form lleva `didSubmit`.
 */
export const GuardadoConExito: Story = {
  args: { action: fn(async () => ({ success: true as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/Ubicación guardada/i)).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: /Guardar ubicación/i }))
    await expect(await canvas.findByText(/Ubicación guardada/i)).toBeInTheDocument()
  },
}
