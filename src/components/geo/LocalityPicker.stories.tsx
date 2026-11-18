import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { withGeolocation } from '@/test/storybook/with-geolocation'
import type { GeoLocality } from '@/modules/geo/geo.types'
import LocalityPicker from './LocalityPicker'

/**
 * Buscador de localidad de todo el país. Cada story usa un texto distinto: el
 * hook recuerda las consultas buenas en memoria y compartirían resultado.
 */
const LUJAN: GeoLocality = {
  city: 'Luján',
  province: 'Buenos Aires',
  department: 'Partido de Luján',
  lat: -34.5703,
  lng: -59.105,
  source: 'dataset',
}
const MERCEDES_BA: GeoLocality = {
  city: 'Mercedes',
  province: 'Buenos Aires',
  department: 'Partido de Mercedes',
  lat: -34.65,
  lng: -59.43,
  source: 'dataset',
}
const MERCEDES_CORRIENTES: GeoLocality = {
  city: 'Mercedes',
  province: 'Corrientes',
  department: 'Departamento Mercedes',
  lat: -29.18,
  lng: -58.07,
  source: 'dataset',
}

function Controlled({ locate }: { locate?: boolean }) {
  const [value, setValue] = useState<GeoLocality | null>(null)
  return (
    <div className="w-full max-w-md">
      <LocalityPicker
        id="loc"
        label="Localidad"
        value={value}
        onChange={setValue}
        locate={locate}
      />
    </div>
  )
}

const meta = {
  title: 'Geo/LocalityPicker',
  component: Controlled,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Controlled>

export default meta
type Story = StoryObj<typeof meta>

export const Vacio: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('combobox', { name: 'Localidad' })).toHaveValue('')
    await expect(canvas.queryByRole('listbox')).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: /Usar mi ubicación actual/ })).toBeVisible()
  },
}

export const ConResultados: Story = {
  parameters: {
    fetchMock: [
      {
        match: '/api/public/geo/localidades',
        json: { results: [MERCEDES_BA, MERCEDES_CORRIENTES, LUJAN] },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('combobox'), 'mercedes')
    // El listbox va en un portal: se busca en todo el documento.
    const body = within(canvasElement.ownerDocument.body)
    const options = await body.findAllByRole('option')
    // 3 resultados + la salida "No está mi localidad".
    await expect(options).toHaveLength(4)
    await userEvent.click(options[1] as HTMLElement)
    await expect(canvas.getByRole('combobox')).toHaveValue('Mercedes, Corrientes')
  },
}

export const SinResultadosYManual: Story = {
  parameters: { fetchMock: [{ match: '/api/public/geo/localidades', json: { results: [] } }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('combobox'), 'Pueblo Chico')
    await expect(await canvas.findByText('No encontramos esa localidad.')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Escribirla a mano' }))
    await expect(canvas.getByLabelText('Ciudad')).toHaveValue('Pueblo Chico')
    await expect(canvas.getByLabelText('Provincia')).toBeVisible()
  },
}

export const Degradado: Story = {
  parameters: {
    fetchMock: [{ match: '/api/public/geo/localidades', json: { results: [], degraded: true } }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('combobox'), 'Chivilcoy')
    await expect(
      await canvas.findByText('No pudimos buscar ahora. Podés escribirla a mano.'),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Escribirla a mano' })).toBeVisible()
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
        json: { result: { city: 'Luján', province: 'Buenos Aires', lat: -34.57, lng: -59.105 } },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Usar mi ubicación actual/ }))
    await expect(await canvas.findByDisplayValue('Luján, Buenos Aires')).toBeVisible()
  },
}
