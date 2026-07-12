import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PricingGridToolbar } from './PricingGridToolbar'

const meta = {
  title: 'Admin/Canchas/PricingGridToolbar',
  component: PricingGridToolbar,
  parameters: { layout: 'padded' },
  args: {
    selectMode: false,
    onToggleSelectMode: fn(),
    selectedCount: 0,
    showBulkBar: false,
    bulkValue: '',
    onBulkValueChange: fn(),
    onApplyBulk: fn(),
    onClearSelection: fn(),
    canApplyBulk: false,
  },
} satisfies Meta<typeof PricingGridToolbar>

export default meta
type Story = StoryObj<typeof meta>

export const SelectModeOff: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('button', { name: 'Seleccionar bloque' })
    await expect(toggle).toBeVisible()
    await expect(canvas.queryByPlaceholderText('35.000')).not.toBeInTheDocument()

    await userEvent.click(toggle)
    await expect(args.onToggleSelectMode).toHaveBeenCalledTimes(1)
  },
}

export const SelectModeOnSinSeleccion: Story = {
  args: { selectMode: true, showBulkBar: true, selectedCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Asignar precio' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Vaciar' })).toBeDisabled()
  },
}

/** Barra masiva con celdas seleccionadas: escribir un precio habilita "Asignar precio". */
export const ConSeleccionYPrecio: Story = {
  args: { selectMode: true, showBulkBar: true, selectedCount: 6 },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('6 celdas')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Asignar precio' })).toBeDisabled()

    await userEvent.type(canvas.getByLabelText('Precio para las celdas seleccionadas'), '35000')
    await expect(args.onBulkValueChange).toHaveBeenLastCalledWith('35000')
  },
}

/** canApplyBulk true (el padre ya parseó un valor válido): el botón queda habilitado. */
export const ListoParaAsignar: Story = {
  args: {
    selectMode: true,
    showBulkBar: true,
    selectedCount: 3,
    bulkValue: '35.000',
    canApplyBulk: true,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const applyBtn = canvas.getByRole('button', { name: 'Asignar precio' })
    await expect(applyBtn).toBeEnabled()
    await userEvent.click(applyBtn)
    await expect(args.onApplyBulk).toHaveBeenCalledTimes(1)
  },
}
