import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { courtFutbol5, courtOffline, courts, openingHours } from '@/test/fixtures'
import { CourtList } from './CourtList'
import type { CourtDeactivationImpactResult } from '../actions'

/**
 * Las 7 Server Actions llegan por prop (ver el comentario en CourtList.tsx).
 * canchas/page.tsx envuelve en `<main className="max-w-4xl mx-auto px-4 py-8">`.
 */
const meta = {
  title: 'Admin/Canchas/CourtList',
  component: CourtList,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <Story />
      </main>
    ),
  ],
  args: {
    initialCourts: courts(),
    openingHours: openingHours(),
    isAdmin: true,
    tenantName: 'Complejo Fénix',
    toggleStatusAction: fn(async () => ({ success: true as const, courtId: 'court-1' })),
    getDeactivationImpactAction: fn(async () => ({
      success: true as const,
      futureBookings: 0,
      activeAbonados: 0,
    })),
    createAction: fn(async () => ({ success: true as const, courtId: 'court-1' })),
    updateAction: fn(async () => ({ success: true as const, courtId: 'court-1' })),
    uploadPhotoAction: fn(async () => ({ success: true as const, photos: [] })),
    removePhotoAction: fn(async () => ({ success: true as const, photos: [] })),
    reorderPhotosAction: fn(async () => ({ success: true as const, photos: [] })),
  },
} satisfies Meta<typeof CourtList>

export default meta
type Story = StoryObj<typeof meta>

export const ConCanchas: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(courtFutbol5().name)).toBeVisible()
    // 3 canchas online (fútbol 5/7/11) + 1 offline (mantenimiento).
    await expect(canvas.getAllByText('Online')).toHaveLength(3)
    await expect(canvas.getByText('Offline')).toBeVisible()
  },
}

export const SinCanchas: Story = {
  args: { initialCourts: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin canchas todavía')).toBeVisible()
    await expect(canvas.getByRole('button', { name: '+ Nueva cancha' })).toBeVisible()
  },
}

/** Manager: puede activar/desactivar, pero no ve "Editar" ni "+ Nueva cancha" (solo admin, Configuración). */
export const VistaManager: Story = {
  args: { isAdmin: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: '+ Nueva cancha' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    await expect(canvas.getAllByRole('button', { name: /desactivar|activar/i }).length).toBeGreaterThan(0)
  },
}

/** "+ Nueva cancha" abre el form (code-split); "+ Nueva cancha" se oculta mientras está abierto. */
export const FormularioAbierto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '+ Nueva cancha' }))

    await expect(await canvas.findByRole('heading', { name: 'Nueva cancha' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: '+ Nueva cancha' })).not.toBeInTheDocument()
  },
}

/** Desactivar consulta el impacto (reservas futuras / abonados activos) antes de confirmar. */
export const DesactivarConImpacto: Story = {
  args: {
    initialCourts: [courtFutbol5()],
    getDeactivationImpactAction: fn(
      async (): Promise<CourtDeactivationImpactResult> => ({
        success: true,
        futureBookings: 4,
        activeAbonados: 2,
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Desactivar' }))

    const dialog = within(await body.findByRole('dialog'))
    await expect(dialog.getByText(/4 reserva\(s\) futura\(s\)/i)).toBeVisible()
    await expect(dialog.getByText(/2 abonado\(s\) activo\(s\)/i)).toBeVisible()
  },
}

/** No se pudo verificar el impacto: toast de error, el dialog NO se abre con datos falsos (#58). */
export const ErrorAlVerificarImpacto: Story = {
  args: {
    initialCourts: [courtFutbol5()],
    getDeactivationImpactAction: fn(
      async (): Promise<CourtDeactivationImpactResult> => ({
        success: false,
        error: 'Timeout de base de datos.',
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Desactivar' }))

    // El Toaster no usa Portal (renderiza inline junto a la story).
    await expect(await canvas.findByText('No se pudo verificar el impacto')).toBeVisible()
    await expect(body.queryByRole('dialog')).not.toBeInTheDocument()
  },
}

/** Activar una cancha offline: sin diálogo de confirmación, un solo click. */
export const ActivarCancha: Story = {
  args: { initialCourts: [courtOffline()] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Activar' }))
    await expect(args.toggleStatusAction).toHaveBeenCalledWith(courtOffline().id, 'online')
  },
}
