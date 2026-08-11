import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { artDateString } from '@/test/fixtures'
import { CloseDayButton } from './CloseDayButton'
import type { CloseDayActionResult } from '../actions'

/** Radix Dialog porta a `document.body`: no depende del fondo de la página (regla 2). */
const meta = {
  title: 'Admin/Caja/CloseDayButton',
  component: CloseDayButton,
  parameters: { layout: 'centered' },
  args: {
    date: artDateString(),
    tenantId: 't-1',
    totalIncome: 4500000,
    totalExpense: 800000,
    balance: 3700000,
    cashTotal: 2000000,
    // Sin fondo declarado por default: expectedCash === cashTotal, openingCash null
    // (mismo número que `balance` tenía antes de migr. 049 — no cambia el resto
    // de las stories que comparan "37000"/"36500" contra este valor).
    expectedCash: 3700000,
    openingCash: null,
    closeDayAction: fn(async (): Promise<CloseDayActionResult> => ({
      success: true,
      close: {
        id: 'close-1',
        tenantId: 't-1',
        date: new Date(),
        totalIncome: 4500000,
        totalAdjustments: 0,
        totalExpense: 800000,
        balance: 3700000,
        declaredCash: 0,
        diffAmount: 3700000,
        openingCash: null,
        expectedCash: null,
        note: null,
        closedBy: 's-1',
        closedAt: new Date(),
      },
    })),
  },
} satisfies Meta<typeof CloseDayButton>

export default meta
type Story = StoryObj<typeof meta>

export const SinEfectivoDeclarado: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('button', { name: 'Cerrar caja' }))

    const dialog = within(await body.findByRole('dialog'))
    await userEvent.type(await dialog.findByLabelText('Escribí CERRAR para confirmar'), 'CERRAR')
    await userEvent.click(dialog.getByRole('button', { name: 'Cerrar caja' }))
    await expect(args.closeDayAction).toHaveBeenCalledWith(args.date, undefined, undefined)
  },
}

/** Efectivo contado igual al saldo neto: sin diferencia, la nota queda opcional. */
export const DiffCero: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('button', { name: 'Cerrar caja' }))

    const dialog = within(await body.findByRole('dialog'))
    // Radix anima la entrada (fade-in ~200ms): esperar a que asiente antes de
    // chequear visibilidad, si no toBeVisible() puede pescar opacity en 0.
    await waitFor(() => expect(dialog.getByLabelText(/efectivo contado/i)).toBeVisible())
    await userEvent.type(dialog.getByLabelText(/efectivo contado/i), '37000')
    await expect(dialog.getByText(/nota \(opcional\)/i)).toBeVisible()
    await expect(dialog.queryByText(/diferencia de/i)).not.toBeInTheDocument()
  },
}

/** Efectivo distinto del saldo: aparece la diferencia y la nota pasa a obligatoria. */
export const DiffRequiereNota: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('button', { name: 'Cerrar caja' }))

    const dialog = within(await body.findByRole('dialog'))
    await waitFor(() => expect(dialog.getByLabelText(/efectivo contado/i)).toBeVisible())
    await userEvent.type(dialog.getByLabelText(/efectivo contado/i), '36500')

    // Pinneado a la dirección (falta/sobra): un refactor que la pierda debe fallar acá.
    await expect(
      dialog.getByText(/diferencia de.*efectivo esperado.*(falta|sobra) plata/i),
    ).toBeVisible()
    await expect(dialog.getByText(/nota \(obligatoria\)/i)).toBeVisible()

    // El type-to-confirm (fase "CERRAR") solo depende de la frase, no de la
    // nota: el confirm queda habilitado, pero onConfirm (CloseDayButton)
    // rechaza el submit sin nota — el gate real es ese, no el botón.
    await userEvent.type(await dialog.findByLabelText('Escribí CERRAR para confirmar'), 'CERRAR')
    await userEvent.click(dialog.getByRole('button', { name: 'Cerrar caja' }))
    await expect(await dialog.findByRole('alert')).toHaveTextContent(/nota es obligatoria/i)
    await expect(args.closeDayAction).not.toHaveBeenCalled()
  },
}

/** Con apertura de caja: el resumen agrega "Fondo inicial" y "Efectivo esperado" (migr. 049). */
export const ConFondoInicial: Story = {
  args: {
    openingCash: 500000,
    // Fondo 5.000 + neto cash 20.000 (cashTotal del meta) = esperado 25.000.
    expectedCash: 2500000,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('button', { name: 'Cerrar caja' }))

    const dialog = within(await body.findByRole('dialog'))
    // Radix anima la entrada (fade-in ~200ms): esperar a que asiente antes de
    // chequear visibilidad, si no toBeVisible() puede pescar opacity en 0.
    await waitFor(() => expect(dialog.getByText('Fondo inicial')).toBeVisible())
    await expect(dialog.getByText('$ 5.000,00')).toBeVisible()
    await expect(dialog.getByText('Efectivo esperado')).toBeVisible()
    await expect(dialog.getByText('$ 25.000,00')).toBeVisible()
  },
}

/** La action rechaza el cierre (ej. día ya cerrado): mensaje inline, el diálogo sigue abierto. */
export const ErrorDeCierre: Story = {
  args: {
    closeDayAction: fn(async (): Promise<CloseDayActionResult> => ({
      success: false,
      error: `La caja del ${artDateString()} ya fue cerrada.`,
    })),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('button', { name: 'Cerrar caja' }))

    const dialog = within(await body.findByRole('dialog'))
    await userEvent.type(await dialog.findByLabelText('Escribí CERRAR para confirmar'), 'CERRAR')
    await userEvent.click(dialog.getByRole('button', { name: 'Cerrar caja' }))
    await expect(await dialog.findByRole('alert')).toHaveTextContent(/ya fue cerrada/i)
  },
}
