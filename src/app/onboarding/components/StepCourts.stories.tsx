import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { pendingAction } from '@/test/pending-action'
import { courtFutbol5, courtFutbol7 } from '@/test/fixtures/court'
import { StepCourts } from './StepCourts'

/**
 * Firma real: createWizardCourtsAction/uploadOnboardingCourtPhotoAction/etc.
 * son Server Actions ('use server') — entran por prop, nunca importadas
 * (ver comentario en StepIdentity.tsx / regla del repo).
 */
const meta = {
  title: 'Onboarding/StepCourts',
  component: StepCourts,
  parameters: { layout: 'padded' },
  // El paso 3 vive dentro de `.card-premium rounded-2xl p-6 md:p-8` (ancho,
  // wide=true) — ver page.tsx del wizard.
  decorators: [
    (Story) => (
      <div className="card-premium max-w-2xl rounded-2xl p-6 md:p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    existingCourts: [],
    createCourtsAction: fn(async () => ({ success: true as const })),
    setStepAction: fn(async () => ({ success: true as const })),
    uploadPhotoAction: fn(async () => ({
      success: true as const,
      url: 'https://example.com/foto.webp',
    })),
    deletePhotoAction: fn(async () => ({ success: true as const })),
  },
} satisfies Meta<typeof StepCourts>

export default meta
type Story = StoryObj<typeof meta>

/** Complejo nuevo: arranca con un borrador precargado "Cancha 1", ya expandido. */
export const SinCanchasExistentes: Story = {}

/**
 * Revisita con "Volver" (ya hay canchas creadas): arranca sin borradores
 * nuevos — Continuar sin tocar nada es válido (`inputs.length === 0 && count > 0`).
 */
export const ConCanchasExistentes: Story = {
  args: { existingCourts: [courtFutbol5(), courtFutbol7()] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cancha 1', { exact: true })).toBeInTheDocument()
    await expect(canvas.getByText('Cancha 2', { exact: true })).toBeInTheDocument()
    await expect(
      canvas.getByText('Estas ya están creadas — las editás después desde Canchas.'),
    ).toBeInTheDocument()
    // Sin borradores nuevos todavía: ningún campo "Nombre" editable en pantalla.
    await expect(canvas.queryByLabelText('Nombre *')).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: /agregar otra cancha/i }))
    await expect(canvas.getByLabelText('Nombre *')).toHaveValue('Cancha 3')
  },
}

/** "+ Agregar otra" duplica la anterior — el caso real es N canchas iguales. */
export const VariosBorradores: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /agregar otra cancha/i }))
    await expect(
      canvas.getByText('Copiamos los datos de la anterior — cambiá solo lo distinto.'),
    ).toBeInTheDocument()
    // 2 borradores → ambos se pueden quitar (canRemove = drafts.length > 1).
    await expect(canvas.getAllByRole('button', { name: /quitar/i })).toHaveLength(2)
  },
}

/**
 * Precio no numérico ("0", sin dígitos válidos): pasa el `required` nativo
 * (no está vacío) pero `parsePesosToCents` lo rechaza — dispara el mensaje
 * custom, no el popup nativo del browser.
 */
export const ErrorDePrecio: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Precio por turno *'), '0')
    await userEvent.click(canvas.getByRole('button', { name: /^continuar$/i }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Cargá el precio por turno de Cancha 1.',
    )
  },
}

const enviandoCanchas = pendingAction({ success: true as const })

export const EnviandoCanchas: Story = {
  args: { createCourtsAction: fn(enviandoCanchas.action) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Precio por turno *'), '20000')
    const submit = canvas.getByRole('button', { name: /^continuar$/i })
    await userEvent.click(submit)
    await expect(submit).toBeDisabled()
    // Sin release la transición queda viva y contamina la story siguiente del
    // archivo (ver el docstring de pendingAction). Acá hay una después.
    await enviandoCanchas.release(submit)
  },
}

const volviendoCanchas = pendingAction({ success: true as const })

export const VolviendoAlPasoAnterior: Story = {
  args: { setStepAction: fn(volviendoCanchas.action) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const back = canvas.getByRole('button', { name: /^volver$/i })
    await userEvent.click(back)
    await expect(back).toBeDisabled()
    await expect(canvas.getByRole('button', { name: /^continuar$/i })).toBeDisabled()
    // Última story del archivo: hoy es segura por posición, no por diseño.
    // Se libera igual para que reordenar exports no la vuelva a romper.
    await volviendoCanchas.release(back)
  },
}
