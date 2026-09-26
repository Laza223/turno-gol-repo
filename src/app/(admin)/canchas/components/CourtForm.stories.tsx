import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { court, courtFutbol7, openingHours } from '@/test/fixtures'
import { CourtForm } from './CourtForm'

const HOURS = openingHours()

/**
 * Las 5 Server Actions llegan por prop (ver el comentario en CourtForm.tsx):
 * '../actions' es `'use server'`. Reemplaza a la lista entera mientras está
 * abierto (CourtList.tsx): es una página propia, con volver a "Canchas".
 */
const meta = {
  title: 'Admin/Canchas/CourtForm',
  component: CourtForm,
  parameters: { layout: 'padded' },
  args: {
    court: null,
    openingHours: HOURS,
    tenantId: 'tenant-story',
    closesNextDay: false,
    otherCourts: [],
    onSaved: fn(),
    onCancel: fn(),
    createAction: fn(async () => ({ success: true as const, courtId: 'court-1' })),
    updateAction: fn(async () => ({ success: true as const, courtId: 'court-1' })),
    uploadPhotoAction: fn(async () => ({ success: true as const, photos: [] })),
    removePhotoAction: fn(async () => ({ success: true as const, photos: [] })),
    reorderPhotosAction: fn(async () => ({ success: true as const, photos: [] })),
  },
} satisfies Meta<typeof CourtForm>

export default meta
type Story = StoryObj<typeof meta>

/** Cancha nueva: arranca sin fotos (se eligen acá y se suben al crear) y sin precios. */
export const NuevaCancha: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Nueva cancha' })).toBeVisible()
    await expect(canvas.getByLabelText('Precio del turno')).toBeVisible()
    await expect(canvas.getByRole('heading', { name: 'Fotos' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Agregar foto' })).toBeVisible()
    // Sin foto, el aviso dice cómo sale y la vista previa lo muestra.
    await expect(canvas.getByText(/sale como un fondo verde/)).toBeVisible()
    await expect(canvas.getByText('Así la ve el jugador')).toBeVisible()
  },
}

/** Editar cancha existente: precios ya cargados + sección de fotos habilitada. */
export const EditarCancha: Story = {
  args: { court: court() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Cancha 1' })).toBeVisible()
    await expect(canvas.getByDisplayValue('Cancha 1')).toBeVisible()
    await expect(canvas.getByRole('heading', { name: 'Fotos' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Guardar cambios' })).toBeVisible()
  },
}

/** "Igual que…" aparece cuando el complejo tiene otra cancha con precio. */
export const ConOtrasCanchasParaCopiar: Story = {
  args: {
    court: court(),
    otherCourts: [
      { id: courtFutbol7().id, name: courtFutbol7().name, rules: courtFutbol7().pricing.rules },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¿Cobra lo mismo que otra cancha?')).toBeVisible()
    // Mismo precio que la que se edita: la opción ya sale marcada.
    await expect(canvas.getByRole('button', { name: /Igual que Cancha 2/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

/** Guardar con horarios sin precio: gate del lado del cliente, la action no se llama. */
export const ErrorHorariosSinPrecio: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText(/nombre/i), 'Cancha nueva')
    await userEvent.click(canvas.getByRole('button', { name: 'Crear cancha' }))

    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'No se puede guardar: falta el precio del turno.',
    )
    await expect(args.createAction).not.toHaveBeenCalled()
  },
}

/** Cancelar vuelve a la lista sin guardar cambios. */
export const Cancelar: Story = {
  args: { court: court() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar' }))
    await expect(args.onCancel).toHaveBeenCalledTimes(1)
  },
}
