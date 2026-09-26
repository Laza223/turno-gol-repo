import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { court, courtFutbol5, courtOffline, courts, openingHours } from '@/test/fixtures'
import { CourtList } from './CourtList'
import type { CourtActionResult, CourtDeactivationImpactResult } from '../actions'

/**
 * Las 7 Server Actions llegan por prop (ver el comentario en CourtList.tsx).
 * El decorator replica el `<main>` de AdminLayoutShell (tope de 1600 px).
 */
const meta = {
  title: 'Admin/Canchas/CourtList',
  component: CourtList,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <Story />
      </main>
    ),
  ],
  args: {
    initialCourts: courts(),
    openingHours: openingHours(),
    tenantId: 'tenant-story',
    closesNextDay: false,
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
    await expect(canvas.getAllByText('Activa')).toHaveLength(3)
    await expect(canvas.getByText('Pausada')).toBeVisible()
  },
}

/**
 * Las canchas del fixture no tienen foto: en el lugar de la miniatura queda un
 * hueco "Sin foto" que abre el editor directo en Fotos (nada bloquea crearlas así).
 */
export const SinFotos: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('button', { name: /^Agregar foto a / })).toHaveLength(4)
    await userEvent.click(
      canvas.getByRole('button', { name: `Agregar foto a ${args.initialCourts[0]!.name}` }),
    )
    await expect(
      await canvas.findByRole('heading', { name: 'Fotos' }, { timeout: 15_000 }),
    ).toBeInTheDocument()
  },
}

/** El precio se lee en la fila y un toque sobre él abre el editor de esa cancha. */
export const PrecioEnLaFila: Story = {
  args: { initialCourts: [courtFutbol5()] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const price = canvas.getByRole('button', { name: 'Cambiar el precio de Cancha 1' })
    await expect(price).toHaveTextContent(/9\.000/)
    await expect(price).toHaveTextContent(/desde las 18:00/)
    await userEvent.click(price)
    await expect(
      await canvas.findByRole('heading', { name: 'Cancha 1' }, { timeout: 15_000 }),
    ).toBeVisible()
  },
}

/** Ocho canchas: la tabla entera entra en una pantalla de PC. */
export const OchoCanchas: Story = {
  args: {
    initialCourts: Array.from({ length: 8 }, (_, i) =>
      court({
        id: `00000000-0000-4000-8000-0000000002${String(i).padStart(2, '0')}`,
        name: `Cancha ${i + 1}`,
        format: i < 5 ? 5 : 7,
        status: i === 7 ? 'offline' : 'online',
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('listitem')).toHaveLength(8)
    await expect(canvas.getByText('8 canchas · Complejo Fénix')).toBeVisible()
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

/**
 * Manager: puede activar/desactivar. "Editar" y "+ Nueva cancha" los VE, con candado
 * y tooltip, en vez de desaparecer — MASTER §12 CHK-admin: un ítem bloqueado por rol
 * se muestra bloqueado, nunca se esconde, para que el encargado sepa que existe y no
 * crea que la app está rota.
 *
 * El assert no puede ser `queryByRole('button')` a secas: el bloqueado es un <span>, así
 * que esa consulta devolvía null tanto ANTES (cuando no se renderizaba nada) como AHORA
 * — pasaba por el motivo equivocado. Se verifica el texto presente y que NO sea un botón.
 */
export const VistaManager: Story = {
  args: { isAdmin: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const nuevaCancha = canvas.getAllByText(/Nueva cancha/)
    await expect(nuevaCancha.length).toBeGreaterThan(0)
    await expect(canvas.queryByRole('button', { name: /Nueva cancha/ })).not.toBeInTheDocument()

    const editar = canvas.getAllByText('Editar')
    await expect(editar.length).toBeGreaterThan(0)
    await expect(canvas.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()

    await expect(canvas.getAllByText(/solo el dueño puede/i).length).toBeGreaterThan(0)

    // Pausar y reactivar SÍ son del encargado.
    await expect(canvas.getAllByRole('button', { name: /^(Pausar|Reactivar)$/ }).length).toBe(4)
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

/** Pausar consulta el impacto (turnos por delante / turnos fijos) antes de confirmar. */
export const PausarConImpacto: Story = {
  args: {
    initialCourts: [courtFutbol5()],
    getDeactivationImpactAction: fn(async (): Promise<CourtDeactivationImpactResult> => ({
      success: true,
      futureBookings: 4,
      activeAbonados: 2,
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Pausar' }))

    // ConfirmDialog entra por next/dynamic (CourtList.tsx): timeout largo para
    // no flakear bajo carga.
    const dialog = within(await body.findByRole('dialog', {}, { timeout: 15_000 }))
    // Radix anima la entrada (fade-in ~200ms): esperar a que asiente antes de
    // chequear visibilidad, si no toBeVisible() puede pescar opacity en 0.
    await waitFor(() =>
      expect(
        dialog.getByText('Tiene 4 turnos por delante. Siguen en pie hasta que los canceles.'),
      ).toBeVisible(),
    )
    await expect(dialog.getByText('Tiene 2 turnos fijos activos.')).toBeVisible()
    await expect(dialog.getByText(/los jugadores no la ven en tu perfil/)).toBeVisible()

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
    getDeactivationImpactAction: fn(async (): Promise<CourtDeactivationImpactResult> => ({
      success: false,
      error: 'Timeout de base de datos.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Pausar' }))

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

/**
 * Prender una cancha por encima de las facturadas: no se bloquea, pero antes
 * de prenderla se muestra cuánto pasa a costar la cuota (decisión 2026-09-17).
 */
export const ActivarCanchaSubeLaCuota: Story = {
  args: {
    initialCourts: [courtOffline()],
    toggleStatusAction: fn(async (): Promise<CourtActionResult> => ({
      success: false,
      error: 'Prender esta cancha sube tu cuota.',
      requiresBillingConfirmation: {
        currentBilledCourts: 4,
        nextBilledCourts: 5,
        currentMonthlyCents: 13_700_000,
        nextMonthlyCents: 16_700_000,
        isTrialing: false,
      },
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Reactivar' }))
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      {},
      { timeout: 15_000 },
    )
    await expect(dialog).toHaveTextContent('Esto suma tu 5ª cancha')
    await expect(dialog).toHaveTextContent(/137\.000/)
    await expect(dialog).toHaveTextContent(/167\.000/)

    // Mismo motivo que en PausarConImpacto: un portal abierto contamina la
    // story siguiente del archivo.
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole('dialog'),
      ).not.toBeInTheDocument(),
    )
  },
}

/** Reactivar una cancha pausada: sin diálogo de confirmación, un solo click. */
export const ActivarCancha: Story = {
  args: { initialCourts: [courtOffline()] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Reactivar' }))
    await expect(args.toggleStatusAction).toHaveBeenCalledWith(courtOffline().id, 'online')
  },
}
