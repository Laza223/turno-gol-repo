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
      <div className="max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xs">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DataExportButton>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {}

/**
 * `fetch` en vuelo: deja el botón en 'loading' de forma estable (en vez de una
 * carrera contra los microtasks del fetch mockeado real).
 *
 * El componente NO usa transiciones de React — `status` es un `useState` — así
 * que acá no aplica el helper `pendingAction`. El riesgo era otro: el spy sobre
 * `window.fetch` no se restauraba, y sin `restoreMocks` sobrevivía al archivo.
 * Ahora `vitest.storybook.config.ts` lo restaura solo, y el `finally` lo libera
 * dentro de la propia story para no dejar un fetch colgado ni un tick.
 */
export const Cargando: Story = {
  play: async ({ canvasElement }) => {
    let releaseFetch: () => void = () => {}
    const inFlight = new Promise<Response>((resolve) => {
      releaseFetch = () => resolve(new Response('{}', { status: 200 }))
    })
    spyOn(window, 'fetch').mockImplementation(() => inFlight)
    try {
      const canvas = within(canvasElement)
      await userEvent.click(canvas.getByRole('button', { name: 'Descargar mis datos' }))
      await expect(await canvas.findByRole('button', { name: 'Generando...' })).toBeDisabled()
    } finally {
      releaseFetch()
    }
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
