import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import LocationPickerField from './LocationPickerField'

/**
 * Campo de ubicación del complejo: mapa de Leaflet más los dos inputs ocultos
 * que son lo que el formulario realmente envía.
 *
 * Los tiles los pisa el decorator global `withOfflineTiles`
 * (`.storybook/preview.tsx`) por un tile en blanco embebido — sin eso serían
 * requests reales a un tercero desde el runner. Lo que se prueba acá no es el
 * dibujo del mapa sino el contrato con el form: qué llega en `latitude` y
 * `longitude` en cada estado.
 */
const meta = {
  title: 'Admin/Settings/LocationPickerField',
  component: LocationPickerField,
  parameters: { layout: 'padded' },
  args: {
    initialLatitude: null,
    initialLongitude: null,
    fallbackCenter: [-32.9468, -60.6393] as [number, number],
    fallbackZoom: 8,
  },
  decorators: [
    (Story) => (
      <form className="w-full max-w-xl">
        <Story />
      </form>
    ),
  ],
} satisfies Meta<typeof LocationPickerField>

export default meta
type Story = StoryObj<typeof meta>

function hiddenValue(canvasElement: HTMLElement, name: string): string {
  const input = canvasElement.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  return input?.value ?? '<ausente>'
}

/** Estado de arranque de todo complejo hoy: las columnas están en NULL. */
export const SinPunto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Sin ubicación marcada/i)).toBeInTheDocument()
    // Vacío, no "0": es la diferencia entre no tener ubicación y estar en el
    // Golfo de Guinea.
    await expect(hiddenValue(canvasElement, 'latitude')).toBe('')
    await expect(hiddenValue(canvasElement, 'longitude')).toBe('')
  },
}

export const ConPunto: Story = {
  args: { initialLatitude: -32.9468, initialLongitude: -60.6393 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Punto marcado en/i)).toBeInTheDocument()
    await expect(hiddenValue(canvasElement, 'latitude')).toBe('-32.9468')
    await expect(canvas.getByRole('button', { name: /Quitar ubicación/i })).toBeInTheDocument()
  },
}

export const QuitarElPunto: Story = {
  args: { initialLatitude: -32.9468, initialLongitude: -60.6393 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Quitar ubicación/i }))
    await expect(canvas.getByText(/Sin ubicación marcada/i)).toBeInTheDocument()
    // Los dos a la vez: media coordenada es un estado que ninguna pantalla
    // sabe renderizar, y el esquema la rechaza.
    await expect(hiddenValue(canvasElement, 'latitude')).toBe('')
    await expect(hiddenValue(canvasElement, 'longitude')).toBe('')
  },
}

/**
 * El camino sin mouse. Leaflet ya deja mover el mapa con las flechas, así que
 * con este botón todo el campo queda operable por teclado sin depender de un
 * click sobre el canvas.
 */
export const PonerElPuntoConTeclado: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const boton = await canvas.findByRole('button', { name: /Poner el punto en el centro/i })
    // El botón nace `disabled` (`disabled={!map}`) hasta que Leaflet termina de
    // montar, y `disabled` trae `pointer-events: none`. `findByRole` lo
    // encuentra igual estando deshabilitado, así que sin esta espera el click
    // sale contra un botón inerte y el error es "pointer-events: none", que se
    // lee como un bug de CSS y no como lo que es: llegamos temprano. Sólo se
    // notaba cuando el runner tenía más carga.
    await waitFor(() => expect(boton).toBeEnabled())
    await userEvent.click(boton)
    await expect(canvas.getByText(/Punto marcado en/i)).toBeInTheDocument()
    await expect(hiddenValue(canvasElement, 'latitude')).not.toBe('')
    await expect(hiddenValue(canvasElement, 'longitude')).not.toBe('')
  },
}

/** Variante del wizard: el paso 1 no puede engordar por un campo opcional. */
export const ColapsadoEnElWizard: Story = {
  args: { collapsible: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: /Marcarlo en el mapa/i })
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // Los inputs ocultos viven FUERA del panel: aunque el mapa esté
    // desmontado, el form serializa igual.
    await expect(hiddenValue(canvasElement, 'latitude')).toBe('')
    await userEvent.click(trigger)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  },
}

/** En revisita, un punto ya cargado abre el panel solo. */
export const ColapsableConPuntoYaCargado: Story = {
  args: { collapsible: true, initialLatitude: -32.9468, initialLongitude: -60.6393 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /Ocultar el mapa/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  },
}
