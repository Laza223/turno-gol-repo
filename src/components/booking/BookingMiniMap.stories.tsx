import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import BookingMiniMap from './BookingMiniMap'

/**
 * react-leaflet: monta un `MapContainer` real (DOM real, sin SSR — se usa
 * siempre vía `next/dynamic({ ssr: false })` desde BookingSuccessExtras) y pide
 * tiles a `{s}.tile.openstreetmap.org`. El decorator global `withOfflineTiles`
 * (`.storybook/preview.tsx`) pisa esa URL por un tile en blanco embebido —
 * sin eso son requests reales a un tercero desde el runner de CI. El
 * contenedor y el pin se montan igual, suficiente para validar que el
 * componente aísla sin arrastrar nada de `'use server'` ni de auth.
 */
const meta = {
  title: 'Player/BookingSuccess/BookingMiniMap',
  component: BookingMiniMap,
  parameters: { layout: 'padded' },
  args: {
    lat: -34.6083,
    lng: -58.4386,
    label: 'Complejo Fénix',
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-border shadow-xs">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BookingMiniMap>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Ubicación de Complejo Fénix')).toBeInTheDocument()
  },
}
