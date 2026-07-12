import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test'
import AbonadoForm from './AbonadoForm'
import type { NewAbonadoState, PreviewAbonadoSlotsResult } from './actions'

const COURTS = [
  { id: '00000000-0000-4000-8000-000000000101', name: 'Cancha 1' },
  { id: '00000000-0000-4000-8000-000000000102', name: 'Cancha 2' },
]

async function fillRequiredFields(canvas: ReturnType<typeof within>) {
  await userEvent.selectOptions(canvas.getByLabelText('Cancha'), COURTS[0]!.id)
  // date/time: fireEvent.change con el valor ISO — userEvent.type tipea los
  // segmentos visibles del input nativo (formato dependiente del locale del
  // browser), fireEvent.change setea el .value directo, sin ambigüedad.
  await fireEvent.change(canvas.getByLabelText('Empieza el'), { target: { value: '2026-03-16' } })
  await fireEvent.change(canvas.getByLabelText('Hora de inicio'), { target: { value: '20:00' } })
  await fireEvent.change(canvas.getByLabelText('Hora de fin'), { target: { value: '21:00' } })
  await userEvent.type(canvas.getByLabelText('Nombre y apellido'), 'Grupo Test')
  await userEvent.type(canvas.getByLabelText('Teléfono'), '1122334455')
  await userEvent.type(canvas.getByLabelText('Precio por turno (en pesos)'), '25000')
}

/**
 * submitAction/previewAction llegan por prop (ver el comentario en
 * AbonadoForm.tsx): './actions' es `'use server'`.
 * Vive dentro de `<div className="max-w-4xl space-y-6">` en nuevo/page.tsx,
 * pero el form ya define su propia superficie (`bg-card` con borde) — no hace
 * falta reproducir un contenedor extra para el contraste.
 */
const meta = {
  title: 'Admin/Abonados/AbonadoForm',
  component: AbonadoForm,
  parameters: { layout: 'padded' },
  args: {
    courts: COURTS,
    submitAction: fn(async (): Promise<NewAbonadoState> => ({ status: 'idle' })),
    previewAction: fn(
      async (): Promise<PreviewAbonadoSlotsResult> => ({
        success: true,
        dates: ['2026-03-16', '2026-03-23', '2026-03-30'],
        conflicts: [],
      }),
    ),
  },
} satisfies Meta<typeof AbonadoForm>

export default meta
type Story = StoryObj<typeof meta>

export const FaseFormulario: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Ver fechas del turno' })).toBeVisible()
  },
}

/** Enviar el form pide la vista previa: fechas libres/ocupadas antes de confirmar. */
export const VistaPreviaConFechas: Story = {
  args: {
    previewAction: fn(
      async (): Promise<PreviewAbonadoSlotsResult> => ({
        success: true,
        dates: ['2026-03-16', '2026-03-23', '2026-03-30', '2026-04-06'],
        conflicts: ['2026-03-23'],
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fillRequiredFields(canvas)
    await userEvent.click(canvas.getByRole('button', { name: 'Ver fechas del turno' }))

    await expect(await canvas.findByText('Fechas del turno fijo')).toBeVisible()
    await expect(canvas.getByText('Ocupado')).toBeVisible()
    await expect(canvas.getAllByText('Libre')).toHaveLength(3)
    await expect(canvas.getByRole('button', { name: 'Crear abonado' })).toBeEnabled()
  },
}

/** Todas las fechas ocupadas: el botón de confirmar queda deshabilitado con aviso. */
export const VistaPreviaSinTurnosDisponibles: Story = {
  args: {
    previewAction: fn(
      async (): Promise<PreviewAbonadoSlotsResult> => ({
        success: true,
        dates: ['2026-03-16', '2026-03-23'],
        conflicts: ['2026-03-16', '2026-03-23'],
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fillRequiredFields(canvas)
    await userEvent.click(canvas.getByRole('button', { name: 'Ver fechas del turno' }))

    await expect(await canvas.findByRole('alert')).toHaveTextContent(/no se va a crear ningún turno/i)
    await expect(canvas.getByRole('button', { name: 'Crear abonado' })).toBeDisabled()
  },
}

/** El preview falla (ej. ya hay un turno fijo en ese horario): error inline, sigue en el form. */
export const ErrorDePreview: Story = {
  args: {
    previewAction: fn(
      async (): Promise<PreviewAbonadoSlotsResult> => ({
        success: false,
        error: 'Ya existe un turno fijo activo en ese horario.',
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fillRequiredFields(canvas)
    await userEvent.click(canvas.getByRole('button', { name: 'Ver fechas del turno' }))

    await expect(await canvas.findByRole('alert')).toHaveTextContent(/ya existe un turno fijo/i)
    await expect(canvas.getByRole('button', { name: 'Ver fechas del turno' })).toBeVisible()
  },
}

/** Confirmar desde la vista previa llama a submitAction con el FormData reconstruido. */
export const ConfirmarCreaElAbonado: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await fillRequiredFields(canvas)
    await userEvent.click(canvas.getByRole('button', { name: 'Ver fechas del turno' }))
    await canvas.findByText('Fechas del turno fijo')

    await userEvent.click(canvas.getByRole('button', { name: 'Crear abonado' }))
    await expect(args.submitAction).toHaveBeenCalledTimes(1)
  },
}
