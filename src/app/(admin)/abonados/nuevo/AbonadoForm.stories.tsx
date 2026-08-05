import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import AbonadoForm from './AbonadoForm'
import type { NewAbonadoState, PreviewAbonadoSlotsResult } from './actions'

const COURTS = [
  { id: '00000000-0000-4000-8000-000000000101', name: 'Cancha 1' },
  { id: '00000000-0000-4000-8000-000000000102', name: 'Cancha 2' },
]

/**
 * Abre un Combobox, elige una opción y espera a que el panel (portaled,
 * `role="dialog"` con listbox `overflow-auto`) termine de desmontarse. Radix
 * lo saca del DOM recién al terminar la animación de salida: sin esperar, el
 * nodo puede seguir presente cuando termina el `play` y el scan de axe
 * (afterEach) lo agarra a mitad de camino — "scrollable-region-focusable"
 * sobre un panel que ya no se ve.
 */
async function selectComboboxOption(
  canvas: ReturnType<typeof within>,
  body: ReturnType<typeof within>,
  triggerLabel: string,
  optionName: string,
) {
  await userEvent.click(canvas.getByLabelText(triggerLabel))
  await userEvent.click(await body.findByRole('option', { name: optionName }))
  await waitFor(() => expect(body.queryByRole('listbox')).not.toBeInTheDocument())
}

async function fillRequiredFields(canvas: ReturnType<typeof within>, canvasElement: HTMLElement) {
  const body = within(canvasElement.ownerDocument.body)

  // Cancha: Combobox (ya no <select> nativo).
  await selectComboboxOption(canvas, body, 'Cancha', COURTS[0]!.name)

  // Empieza el: DatePicker sin <label htmlFor> (el <label> vecino es solo
  // visual) — el trigger es un <button> con "Seleccionar fecha" como nombre
  // accesible. El reloj congelado del preview abre en marzo de 2026; el 16
  // es lunes y coincide con el día semanal por defecto (Lunes), así que
  // queda habilitado.
  await userEvent.click(canvas.getByRole('button', { name: 'Seleccionar fecha' }))
  await userEvent.click(await body.findByRole('button', { name: '16' }))
  // Esperar el cierre del calendario, igual que `selectComboboxOption` hace con
  // el listbox: mientras el popover de Radix sigue montado marca el resto del
  // árbol con aria-hidden, y `getByRole` deja de ver los controles del form
  // (el síntoma es "Unable to find button Continuar" con un dump de roles casi
  // vacío). En aislado la ventana es de milisegundos; bajo la suite completa se
  // ensancha lo suficiente para pegarle.
  await waitFor(() => expect(body.queryByRole('button', { name: '16' })).not.toBeInTheDocument())

  // Hora inicio: Combobox — elegir 20:00 también setea Hora fin a 21:00
  // (AbonadoForm.tsx: onChange de timeStart llama addOneHour).
  await selectComboboxOption(canvas, body, 'Hora inicio', '20:00')

  // Cliente: el <label> ("Cliente") tampoco tiene htmlFor — se ubica por el
  // placeholder del input.
  await userEvent.type(canvas.getByPlaceholderText('Nombre y apellido'), 'Grupo Test')
  // El label de PhoneInput es "Teléfono *" (asterisco de requerido en un
  // <span> aparte): match exacto falla, hace falta un regex parcial.
  await userEvent.type(canvas.getByLabelText(/Teléfono/i), '1122334455')
  await userEvent.type(canvas.getByLabelText('Precio por turno (pesos)'), '25000')
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
    await expect(await canvas.findByRole('button', { name: 'Continuar' })).toBeVisible()
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
    await fillRequiredFields(canvas, canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Continuar' }))

    await expect(await canvas.findByText('Vista previa de fechas')).toBeVisible()
    await expect(canvas.getByText('Ocupado')).toBeVisible()
    await expect(canvas.getAllByText('Libre')).toHaveLength(3)
    await expect(canvas.getByRole('button', { name: 'Confirmar y Crear Abonado' })).toBeEnabled()
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
    await fillRequiredFields(canvas, canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Continuar' }))

    await expect(await canvas.findByRole('alert')).toHaveTextContent(/no se creará ningún turno/i)
    await expect(canvas.getByRole('button', { name: 'Confirmar y Crear Abonado' })).toBeDisabled()
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
    await fillRequiredFields(canvas, canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Continuar' }))

    await expect(await canvas.findByRole('alert')).toHaveTextContent(/ya existe un turno fijo/i)
    await expect(await canvas.findByRole('button', { name: 'Continuar' })).toBeVisible()
  },
}

/** Confirmar desde la vista previa llama a submitAction con el FormData reconstruido. */
export const ConfirmarCreaElAbonado: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await fillRequiredFields(canvas, canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Continuar' }))
    await canvas.findByText('Vista previa de fechas')

    await userEvent.click(canvas.getByRole('button', { name: 'Confirmar y Crear Abonado' }))
    await expect(args.submitAction).toHaveBeenCalledTimes(1)
  },
}
