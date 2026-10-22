import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, spyOn, userEvent, waitFor, within } from 'storybook/test'
import {
  ABONADOS_EXPORT_HEADER,
  BOOKINGS_EXPORT_HEADER,
  CLIENTS_EXPORT_HEADER,
} from '@/modules/reports/data-export'
import type { DataExportResult } from './actions'
import { DatosView } from './DatosView'

const chunk = (
  header: string,
  body: string,
  rows: number,
  nextCursor: string | null = null,
): DataExportResult => ({ success: true, header, body, rows, nextCursor })

/**
 * Ajustes → Tus datos. Las tres actions llegan por prop: las reservas vienen
 * de a páginas (`nextCursor`) y la vista las junta en un solo archivo.
 */
const meta = {
  title: 'Admin/Settings/DatosView',
  component: DatosView,
  parameters: { layout: 'padded' },
  args: {
    fileStem: 'complejo-demo-2026-10-22',
    exportBookingsAction: fn(async () => chunk(BOOKINGS_EXPORT_HEADER, '', 0)),
    exportAbonadosAction: fn(async () => chunk(ABONADOS_EXPORT_HEADER, '', 0)),
    exportClientsAction: fn(async () => chunk(CLIENTS_EXPORT_HEADER, '', 0)),
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DatosView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Dos páginas de reservas terminan en UN archivo, con el encabezado una sola vez. */
export const ReservasEnVariasPaginas: Story = {
  args: {
    exportBookingsAction: fn(async (cursor: string | null) =>
      cursor === null
        ? chunk(BOOKINGS_EXPORT_HEADER, 'fila-1', 2000, 'cursor-1')
        : chunk(BOOKINGS_EXPORT_HEADER, 'fila-2', 3),
    ),
  },
  play: async ({ args, canvasElement }) => {
    const createUrl = spyOn(URL, 'createObjectURL').mockReturnValue('blob:story')
    let filename = ''
    spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filename = this.download
    })

    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Descargar reservas' }))

    await waitFor(() => expect(createUrl).toHaveBeenCalledTimes(1))
    await expect(args.exportBookingsAction).toHaveBeenNthCalledWith(1, null)
    await expect(args.exportBookingsAction).toHaveBeenNthCalledWith(2, 'cursor-1')
    const blob = createUrl.mock.calls[0]![0] as Blob
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // BOM de UTF-8: sin él, Excel abre los acentos rotos.
    await expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    await expect(new TextDecoder().decode(bytes)).toBe(
      `${BOOKINGS_EXPORT_HEADER}\r\nfila-1\r\nfila-2`,
    )
    await expect(filename).toBe('complejo-demo-2026-10-22-reservas.csv')
    await expect(canvas.getByRole('button', { name: 'Descargar reservas' })).toBeEnabled()
  },
}

/** Mientras baja, el botón cuenta lo que ya llegó y los otros dos esperan. */
export const Bajando: Story = {
  play: async ({ args, canvasElement }) => {
    let release: () => void = () => {}
    const pending = new Promise<DataExportResult>((resolve) => {
      release = () => resolve(chunk(BOOKINGS_EXPORT_HEADER, '', 0))
    })
    const action = args.exportBookingsAction as ReturnType<typeof fn>
    action
      .mockImplementationOnce(async () => chunk(BOOKINGS_EXPORT_HEADER, 'fila', 2000, 'cursor-1'))
      .mockImplementationOnce(() => pending)
    spyOn(URL, 'createObjectURL').mockReturnValue('blob:story')
    spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      const canvas = within(canvasElement)
      await userEvent.click(canvas.getByRole('button', { name: 'Descargar reservas' }))
      await expect(
        await canvas.findByRole('button', { name: /Bajando… 2\.000 reservas/ }),
      ).toBeDisabled()
      await expect(canvas.getByRole('button', { name: 'Descargar turnos fijos' })).toBeDisabled()
      await expect(canvas.getByRole('button', { name: 'Descargar clientes' })).toBeDisabled()
    } finally {
      release()
    }
  },
}

/** Si el servidor dice que no, se avisa y no se baja nada. */
export const Rechazado: Story = {
  args: {
    exportClientsAction: fn(async (): Promise<DataExportResult> => ({
      success: false,
      error: 'Solo el administrador puede modificar la configuración.',
    })),
  },
  play: async ({ canvasElement }) => {
    const createUrl = spyOn(URL, 'createObjectURL').mockReturnValue('blob:story')
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Descargar clientes' }))
    const body = within(document.body)
    await expect(await body.findByText('No se pudo descargar')).toBeInTheDocument()
    await expect(
      body.getByText('Solo el administrador puede modificar la configuración.'),
    ).toBeInTheDocument()
    await expect(createUrl).not.toHaveBeenCalled()
    await expect(canvas.getByRole('button', { name: 'Descargar clientes' })).toBeEnabled()
  },
}
