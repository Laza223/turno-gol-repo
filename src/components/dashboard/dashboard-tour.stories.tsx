import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { DashboardTour } from './dashboard-tour'

/**
 * Decorator con los 3 anchors reales del dashboard (`tour-grilla`,
 * `tour-checklist`, `tour-share-link`) para que cada coachmark del tour
 * pueda medir su posición. `action` entra por PROP (ver el comentario en
 * dashboard-tour.tsx): `./actions` es `'use server'` y rompe el bundle de
 * browser de Storybook.
 */
const meta = {
  title: 'Admin/Dashboard/DashboardTour',
  component: DashboardTour,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="relative flex min-h-64 flex-col items-start gap-6 p-10">
        <button
          type="button"
          data-tour-id="tour-grilla"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Ir a la grilla
        </button>
        <div data-tour-id="tour-checklist" className="rounded-xl border border-border p-4 text-sm">
          Configuración del complejo
        </div>
        <button
          type="button"
          data-tour-id="tour-share-link"
          className="rounded-lg border border-border px-3 py-1.5 text-xs"
        >
          Copiar link
        </button>
        <Story />
      </div>
    ),
  ],
  args: {
    action: fn(async () => ({ success: true })),
  },
} satisfies Meta<typeof DashboardTour>

export default meta
type Story = StoryObj<typeof meta>

/** Recorre los 3 pasos con "Siguiente"/"Entendido": al terminar persiste `admin_tour_seen_at`. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)

    await waitFor(() => expect(body.getByText(/abrí la grilla desde acá/i)).toBeVisible())
    await userEvent.click(body.getByRole('button', { name: 'Siguiente' }))

    await waitFor(() => expect(body.getByText(/completá estos pasos/i)).toBeVisible())
    await userEvent.click(body.getByRole('button', { name: 'Siguiente' }))

    await waitFor(() => expect(body.getByText(/compartí este link/i)).toBeVisible())
    await userEvent.click(body.getByRole('button', { name: 'Entendido' }))

    await waitFor(() => expect(args.action).toHaveBeenCalledOnce())
  },
}

/** "Omitir recorrido" en el primer paso corta el tour y persiste igual. */
export const Omitir: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(body.getByText(/abrí la grilla desde acá/i)).toBeVisible())
    await userEvent.click(body.getByText('Omitir recorrido'))
    await waitFor(() => expect(args.action).toHaveBeenCalledOnce())
  },
}
