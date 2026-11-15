import '@/components/booking/reserva.css'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, spyOn, userEvent, within } from 'storybook/test'
import DownloadReceiptButton from './DownloadReceiptButton'

/**
 * Botón único (sin variantes de estado visual): dispara `window.print()` y
 * restaura `document.title` en un `finally`. Vive dentro del ticket de vidrio de la reserva
 * confirmada (portal de vidrio F5): se reproduce ese fondo.
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
      <div data-portal-glass className="portal-ambient p-6 text-portal-ink">
        <div className="rv-ticket glass-painted w-80">
          <Story />
        </div>
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
