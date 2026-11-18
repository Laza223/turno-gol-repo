import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { withGeolocation } from '@/test/storybook/with-geolocation'
import type { GeoAddress, GeoLocality } from '@/modules/geo/geo.types'
import AddressFinder from './AddressFinder'

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

/** Alta del complejo: localidad + calle y altura, con salida siempre ("tal cual"). */
const meta = {
  title: 'Geo/AddressFinder',
  component: AddressFinder,
  parameters: { layout: 'padded' },
  args: { idPrefix: 'addr', onChange: fn() },
  decorators: [
    (Story) => (
      <form className="w-full max-w-md">
        <Story />
      </form>
    ),
  ],
} satisfies Meta<typeof AddressFinder>

export default meta
type Story = StoryObj<typeof meta>

async function elegirLocalidad(canvasElement: HTMLElement, texto: string) {
  const canvas = within(canvasElement)
  await userEvent.type(canvas.getByRole('combobox', { name: 'Localidad' }), texto)
  const body = within(canvasElement.ownerDocument.body)
  await userEvent.click(await body.findByRole('option', { name: /Luján/ }))
}

export const Vacio: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /Usar mi ubicación actual/ })).toBeVisible()
    await expect(canvas.getByLabelText('Calle y altura')).toHaveValue('')
    await expect(canvas.getByRole('button', { name: /Buscar/ })).toBeDisabled()
  },
}

export const ConCandidatos: Story = {
  args: { names: true },
  parameters: {
    fetchMock: [
      { match: '/api/public/geo/localidades', json: { results: [LUJAN] } },
      { match: '/api/public/geo/direcciones', json: { results: [MITRE] } },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await elegirLocalidad(canvasElement, 'lujan')
    await userEvent.type(canvas.getByLabelText('Calle y altura'), 'Bartolomé Mitre 800{Enter}')
    await userEvent.click(await canvas.findByRole('button', { name: MITRE.label }))
    await expect(canvas.getByText('Luján, Buenos Aires')).toBeVisible()
    await expect(args.onChange).toHaveBeenLastCalledWith({
      address: 'Bartolomé Mitre 800',
      city: 'Luján',
      province: 'Buenos Aires',
      latitude: -34.5701,
      longitude: -59.1049,
    })
  },
}

export const SinResultadosTalCual: Story = {
  parameters: {
    fetchMock: [
      { match: '/api/public/geo/localidades', json: { results: [LUJAN] } },
      { match: '/api/public/geo/direcciones', json: { results: [] } },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await elegirLocalidad(canvasElement, 'lujan')
    await userEvent.type(canvas.getByLabelText('Calle y altura'), 'Calle Rara 12{Enter}')
    await expect(await canvas.findByText('No encontramos esa dirección.')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Usar «Calle Rara 12» tal cual' }))
    await expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: 'Calle Rara 12', city: 'Luján' }),
    )
  },
}

export const Degradado: Story = {
  parameters: {
    fetchMock: [
      { match: '/api/public/geo/localidades', json: { results: [LUJAN] } },
      { match: '/api/public/geo/direcciones', json: { results: [], degraded: true } },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await elegirLocalidad(canvasElement, 'lujan')
    await userEvent.type(canvas.getByLabelText('Calle y altura'), 'Mitre 800{Enter}')
    await expect(
      await canvas.findByText('No pudimos buscar ahora. Podés usarla tal cual.'),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: /tal cual/ })).toBeVisible()
  },
}

export const GpsDenegado: Story = {
  decorators: [withGeolocation('denied')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Usar mi ubicación actual/ }))
    await expect(await canvas.findByText(/Tenés bloqueado el permiso de ubicación/)).toBeVisible()
  },
}

export const GpsEncontrado: Story = {
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
            lat: -34.5701,
            lng: -59.1049,
          },
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Usar mi ubicación actual/ }))
    await expect(await canvas.findByText('Bartolomé Mitre 800')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Cambiar' })).toBeVisible()
  },
}

export const ConValorInicial: Story = {
  args: {
    value: {
      address: 'Bartolomé Mitre 800',
      city: 'Luján',
      province: 'Buenos Aires',
      latitude: -34.5701,
      longitude: -59.1049,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Luján, Buenos Aires')).toBeVisible()
  },
}
