import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, spyOn, userEvent, within } from 'storybook/test'
import DownloadReceiptButton from './DownloadReceiptButton'

/**
 * Botón único (sin variantes de estado visual): dispara `window.print()` y
 * restaura `document.title` en un `finally`. Vive dentro de la tarjeta
 * `reserva-receipt-card` de la página de éxito — se reproduce ese fondo.
 */
const meta = {
  title: 'Player/BookingSuccess/DownloadReceiptButton',
  component: DownloadReceiptButton,
  parameters: { layout: 'centered' },
  args: {
    fileName: 'comprobante-complejo-fenix-2026-03-14',
  },
  decorators: [
    (Story) => (
      <div className="reserva-receipt-card w-full max-w-xs rounded-2xl p-5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DownloadReceiptButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ClickImprime: Story = {
  name: 'Click dispara window.print() y restaura document.title',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const printSpy = spyOn(window, 'print').mockImplementation(() => {})
    const originalTitle = document.title

    await userEvent.click(canvas.getByRole('button', { name: 'Descargar comprobante' }))

    await expect(printSpy).toHaveBeenCalledOnce()
    await expect(document.title).toBe(originalTitle)
    printSpy.mockRestore()
  },
}
