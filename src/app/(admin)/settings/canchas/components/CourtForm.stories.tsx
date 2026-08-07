import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { court, courtFutbol7, openingHours } from '@/test/fixtures'
import { CourtForm } from './CourtForm'

const HOURS = openingHours()

/**
 * Las 5 Server Actions llegan por prop (ver el comentario en CourtForm.tsx):
 * '../actions' es `'use server'`. Vive dentro de `<div className="space-y-6">`
 * en CourtList.tsx, pero define su propia superficie `bg-card` con borde.
 */
const meta = {
  title: 'Admin/Canchas/CourtForm',
  component: CourtForm,
  parameters: { layout: 'padded' },
  args: {
    court: null,
    openingHours: HOURS,
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

/** Cancha nueva: arranca sin fotos (recién se puede subir tras crear) y sin precios. */
export const NuevaCancha: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Nueva cancha' })).toBeVisible()
    await expect(canvas.getByText('Sin precios todavía. Empezá por la plantilla rápida.')).toBeVisible()
    await expect(canvas.queryByText('Fotos')).not.toBeInTheDocument()
  },
}

/** Editar cancha existente: precios ya cargados + sección de fotos habilitada. */
export const EditarCancha: Story = {
  args: { court: court() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Editar cancha' })).toBeVisible()
    await expect(canvas.getByDisplayValue('Cancha 1')).toBeVisible()
    await expect(canvas.getByText('Fotos')).toBeVisible()
  },
}

/** "Copiar precios de otra cancha" aparece cuando el complejo tiene más de una. */
export const ConOtrasCanchasParaCopiar: Story = {
  args: {
    court: court(),
    otherCourts: [
      { id: courtFutbol7().id, name: courtFutbol7().name, rules: courtFutbol7().pricing.rules },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Copiar precios de otra cancha:')).toBeVisible()
  },
}

/** Guardar con horarios sin precio: gate del lado del cliente, la action no se llama. */
export const ErrorHorariosSinPrecio: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText(/nombre/i), 'Cancha nueva')
    await userEvent.click(canvas.getByRole('button', { name: 'Crear cancha' }))

    await expect(await canvas.findByRole('alert')).toHaveTextContent(/no se puede guardar/i)
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
