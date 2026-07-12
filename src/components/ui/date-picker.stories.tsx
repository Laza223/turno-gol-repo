import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import DatePicker from './date-picker'

/**
 * Botón trigger con estilos propios (no depende de un `inputClassName`
 * externo, a diferencia de Combobox/PhoneInput) — se muestra suelto, como en
 * los forms que lo usan (AddClosedDateForm, HeroSearch). El reloj congelado
 * del preview (`FROZEN_NOW` = sáb 14-mar-2026) hace determinista el botón
 * "Hoy" y el mes con el que abre el calendario cuando no hay `value`.
 */
function ControlledDatePicker(props: Partial<ComponentProps<typeof DatePicker>>) {
  const [value, setValue] = useState(props.value ?? '')
  return (
    <div className="w-72">
      <DatePicker id="demo-date-picker" value={value} onChange={setValue} {...props} />
    </div>
  )
}

const meta = {
  title: 'Design System/DatePicker',
  component: DatePicker,
  parameters: { layout: 'centered' },
  // Cada story usa `render` con su propio wrapper controlado y no lee `args`;
  // este default solo satisface el tipo (`value`/`onChange` son requeridas).
  args: { value: '', onChange: () => {} },
} satisfies Meta<typeof DatePicker>

export default meta
type Story = StoryObj<typeof meta>

export const SinValor: Story = {
  render: () => <ControlledDatePicker />,
}

export const ConFechaSeleccionada: Story = {
  render: () => <ControlledDatePicker value="2026-03-20" />,
}

/** Click en el trigger abre el calendario del mes actual (marzo 2026, reloj congelado). */
export const CalendarioAbierto: Story = {
  render: () => <ControlledDatePicker value="2026-03-20" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /20\/03\/2026/ }))
    await expect(canvas.getByText('marzo de 2026')).toBeVisible()
    await expect(canvas.getByRole('button', { name: '20' })).toBeVisible()
  },
}

/** Días previos a `min` quedan deshabilitados (opacidad + sin click). */
export const ConMinimo: Story = {
  render: () => <ControlledDatePicker value="2026-03-20" min="2026-03-15" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /20\/03\/2026/ }))
    await expect(canvas.getByRole('button', { name: '10' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: '20' })).toBeEnabled()
  },
}

/** Navegar al mes siguiente y elegir un día lo selecciona y cierra el panel. */
export const NavegarMesYElegir: Story = {
  render: () => <ControlledDatePicker />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByPlaceholderText('Seleccionar fecha'))
    await userEvent.click(canvas.getByRole('button', { name: 'Mes siguiente' }))
    await expect(canvas.getByText('abril de 2026')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '10' }))
    await expect(canvas.getByText('10/04/2026')).toBeVisible()
  },
}

/** El botón "Hoy" del pie usa la fecha real del reloj congelado del preview. */
export const AccionHoy: Story = {
  render: () => <ControlledDatePicker value="2026-03-20" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /20\/03\/2026/ }))
    await userEvent.click(canvas.getByRole('button', { name: 'Hoy' }))
    await expect(canvas.getByText('14/03/2026')).toBeVisible()
  },
}

/** El botón "Borrar" del pie limpia el value y cierra el panel. */
export const AccionBorrar: Story = {
  render: () => <ControlledDatePicker value="2026-03-20" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /20\/03\/2026/ }))
    await userEvent.click(canvas.getByRole('button', { name: 'Borrar' }))
    await expect(canvas.getByText('Seleccionar fecha')).toBeVisible()
  },
}
