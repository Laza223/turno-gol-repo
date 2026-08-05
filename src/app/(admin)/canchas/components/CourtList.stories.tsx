import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
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
    // El CTA aparece 2 veces con el mismo nombre cuando la lista está vacía:
    // uno persistente en el header (PageHeader) y otro grande dentro del
    // EmptyState — patrón intencional, no ambigüedad de query.
    await expect(canvas.getAllByRole('button', { name: '+ Nueva cancha' })).toHaveLength(2)
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

    // CourtForm entra por next/dynamic (el chunk más pesado de la ruta, ver
    // CourtList.tsx): timeout largo para no flakear bajo carga.
    await expect(
      await canvas.findByRole('heading', { name: 'Nueva cancha' }, { timeout: 15_000 }),
    ).toBeVisible()
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

    // ConfirmDialog entra por next/dynamic (CourtList.tsx): timeout largo para
    // no flakear bajo carga.
    const dialog = within(await body.findByRole('dialog', {}, { timeout: 15_000 }))
    // Radix anima la entrada (fade-in ~200ms): esperar a que asiente antes de
    // chequear visibilidad, si no toBeVisible() puede pescar opacity en 0.
    await waitFor(() => expect(dialog.getByText(/4 reserva\(s\) futura\(s\)/i)).toBeVisible())
    await expect(dialog.getByText(/2 turno\(s\) fijo\(s\) activo\(s\)/i)).toBeVisible()

    // Sin cerrar acá, el portal del ConfirmDialog queda montado y contamina
    // la story siguiente del archivo (Error Al Verificar Impacto). Con
    // reducedMotion la salida es casi instantánea — un waitFor sobre
    // queryByRole (no waitForElementToBeRemoved) evita el "ya removido" si
    // el Escape lo saca del DOM antes del primer chequeo.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument())
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
    const toastText = await canvas.findByText('No se pudo verificar el impacto')
    await expect(toastText).toBeVisible()
    await expect(body.queryByRole('dialog')).not.toBeInTheDocument()
    // variant "destructive" persiste ~indefinidamente (design-system §6):
    // cerrarlo acá evita que la siguiente story lo agarre a mitad de la
    // animación de salida (color transitorio => falso positivo de axe).
    const toastItem = toastText.closest('li')
    if (!toastItem) throw new Error('No se encontró el toast')
    await userEvent.click(within(toastItem).getByRole('button', { name: 'Cerrar' }))
    // `waitForElementToBeRemoved` NO sirve acá, en ninguna de sus dos formas, y
    // por dos razones opuestas que dependen del timing:
    //   - sobre `toastText` (un nieto): camina `parentElement` UNA sola vez al
    //     llamarla; si el <li> ya se desprendió de su <ol>, la raíz que captura
    //     es el <li> huérfano y `li.contains(toastText)` da true para siempre.
    //   - sobre `toastItem` (el <li>): si para cuando arranca ya se fue, tira
    //     "element is already removed" — falla por llegar TARDE.
    // Entre las dos no queda ventana: bajo la suite completa el toast a veces
    // se va antes de esta línea y a veces después. `waitFor` + `queryBy` no
    // tiene el problema: "ya no está" satisface la condición sin importar
    // cuándo se fue.
    await waitFor(() =>
      expect(canvas.queryByText('No se pudo verificar el impacto')).not.toBeInTheDocument(),
    )
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
