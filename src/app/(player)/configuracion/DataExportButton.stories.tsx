import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, spyOn, userEvent, within } from 'storybook/test'
import { DataExportButton } from './DataExportButton'

/**
 * Sin Server Action: hace `fetch('/api/player/data-export')` directo. Se
 * mockea con `parameters.fetchMock` (decorator `withFetch`, ver
 * .storybook/decorators/with-fetch.tsx) — no hay MSW en este repo.
 * El contenedor reproduce la card `bg-card` de configuracion/page.tsx donde
 * vive de verdad (el botón usa `text-primary-foreground` sobre `bg-primary`,
 * pensado para esa superficie).
 */
const meta = {
  title: 'Player/Configuracion/DataExportButton',
  component: DataExportButton,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-sm rounded-2xl border border-border bg-card p-5 shadow-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DataExportButton>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {}

/**
 * `fetch` que nunca resuelve: deja el botón en 'loading' de forma estable
 * (en vez de una carrera contra los microtasks del fetch mockeado real).
 */
export const Cargando: Story = {
  play: async ({ canvasElement }) => {
    spyOn(window, 'fetch').mockImplementation(() => new Promise(() => {}))
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Descargar mis datos' }))
    await expect(await canvas.findByRole('button', { name: 'Generando...' })).toBeDisabled()
  },
}

export const ErrorDeServidor: Story = {
  parameters: {
    fetchMock: [{ match: '/api/player/data-export', json: { error: 'server_error' }, status: 500 }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Descargar mis datos' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'No se pudo generar la exportación. Intentá de nuevo en unos minutos.',
    )
  },
}

/** #18: 200 sin el campo `data` — se trata como error para no descargar "undefined". */
export const RespuestaSinData: Story = {
  parameters: {
    fetchMock: [{ match: '/api/player/data-export', json: {} }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Descargar mis datos' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'No se pudo generar la exportación. Intentá de nuevo en unos minutos.',
    )
  },
}
