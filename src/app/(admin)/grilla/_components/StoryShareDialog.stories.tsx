import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { StoryShareDialog } from './StoryShareDialog'

/**
 * Elegir los horarios de la placa (2026-10-26). El diálogo pide las horas libres del día a
 * `/api/public/availability` y arma la placa con `/api/public/story`; acá las dos respuestas
 * son de mentira (la imagen es un recuadro, no la placa real: ese render es de `next/og` y
 * corre en el servidor).
 *
 * Lo que fijan las stories: sin tocar nada salen las primeras 4 y no se manda `hours`; al
 * elegir otras se pide la placa con solo esas; el quinto horario no entra.
 */
const EVENING = ['09:00', '10:00', '11:00', '12:00', '18:00', '19:00', '20:00', '21:00', '22:00']

let storyRequests: string[] = []

/** Un PNG de 1×1 píxel: lo único que importa es que el diálogo reciba una imagen. */
const PIXEL = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHr6ZCwAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

const meta = {
  title: 'Admin/Grilla/StoryShareDialog',
  component: StoryShareDialog,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    storyRequests = []
    const original = window.fetch
    window.fetch = async (input) => {
      const url = String(input)
      if (url.startsWith('/api/public/availability')) {
        const slots = EVENING.map((time) => ({ time, duration: 60, status: 'free', price: 100 }))
        return Response.json({ date: '2026-10-27', courts: [{ id: 'c1', slots }] })
      }
      if (url.startsWith('/api/public/story')) {
        storyRequests.push(url)
        return new Response(new Blob([PIXEL], { type: 'image/png' }), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        })
      }
      return original(input)
    }
    return () => {
      window.fetch = original
    }
  },
  args: {
    slug: 'el-vagon',
    bookingAdvanceDays: 6,
    trackAction: fn(async () => ({ success: true as const })),
    onClose: fn(),
  },
} satisfies Meta<typeof StoryShareDialog>

export default meta
type Story = StoryObj<typeof meta>

const chip = (dialog: ReturnType<typeof within>, hour: string) =>
  dialog.getByRole('button', { name: hour })

/** Sin elegir nada: las primeras 4 libres, y la placa se pide sin `hours`. */
export const PorDefecto: Story = {
  play: async () => {
    const dialog = within(await screen.findByRole('dialog'))
    await waitFor(() => expect(chip(dialog, '09:00')).toBeVisible())
    for (const hour of ['09:00', '10:00', '11:00', '12:00']) {
      await expect(chip(dialog, hour)).toHaveAttribute('aria-pressed', 'true')
    }
    await expect(chip(dialog, '20:00')).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(storyRequests.length).toBeGreaterThan(0))
    await expect(storyRequests[0]).not.toContain('hours=')
  },
}

/** Las de la noche: se destildan las de la mañana, se tildan 20, 21 y 22, y la placa las pide. */
export const ElegirLasDeLaNoche: Story = {
  play: async () => {
    const dialog = within(await screen.findByRole('dialog'))
    await waitFor(() => expect(chip(dialog, '09:00')).toBeVisible())
    for (const hour of ['09:00', '10:00', '11:00']) await userEvent.click(chip(dialog, hour))
    for (const hour of ['20:00', '21:00', '22:00']) await userEvent.click(chip(dialog, hour))
    await waitFor(() =>
      expect(storyRequests.at(-1)).toContain(
        `hours=${encodeURIComponent('12:00,20:00,21:00,22:00')}`,
      ),
    )
    // Ya hay 4: un quinto no entra y avisa.
    await userEvent.click(chip(dialog, '19:00'))
    await expect(chip(dialog, '19:00')).toHaveAttribute('aria-pressed', 'false')
    await expect(dialog.getByText(/Máximo 4 horarios/)).toBeVisible()
  },
}
