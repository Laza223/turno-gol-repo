import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { pendingAction } from '@/test/pending-action'
import { courtFutbol5, courtFutbol7 } from '@/test/fixtures/court'
import { StepCourts } from './StepCourts'
import { draftsStorageKey } from './step-courts/use-court-drafts'

/**
 * Los borradores del paso 3 viven en el storage del browser (antes eran
 * `useState` puro y se perdían al abandonar el paso), y todas las stories del
 * archivo comparten ese storage. Dos consecuencias, las dos verificadas contra
 * el runner y no supuestas:
 *
 *  1. **Cada story necesita su propia clave.** La clave lleva el tenant adentro
 *     (el staff puede administrar más de un complejo), así que basta un tenant
 *     distinto por story: la que agrega una cancha no se la deja puesta a la
 *     siguiente.
 *  2. **La siembra va al cargar el módulo, no en `beforeEach`.** En este runner
 *     el `beforeEach` de CSF corre DESPUÉS del primer render: el `setItem` se
 *     ejecutaba —la sonda lo confirmó— pero el componente ya había leído el
 *     storage vacío. El hook lee su snapshot al montar y solo se entera de una
 *     escritura posterior si la hizo él mismo.
 */
function storyTenant(id: string, seed?: unknown) {
  const tenantId = `sb-${id}`
  const key = draftsStorageKey(tenantId)
  if (seed === undefined) localStorage.removeItem(key)
  else localStorage.setItem(key, typeof seed === 'string' ? seed : JSON.stringify(seed))
  return tenantId
}

const conCanchas = storyTenant('con-canchas')
const varios = storyTenant('varios')
const errorPrecio = storyTenant('error-precio')
const enviando = storyTenant('enviando')
const corruptos = storyTenant('corruptos', '{"no":"es un array"}')
const restaura = storyTenant('restaura', [
  {
    key: 1,
    name: 'Cancha techada',
    format: 7,
    surfaceType: 'synthetic_grass',
    isCovered: true,
    priceCents: 3500000,
  },
  {
    key: 2,
    name: 'Cancha del fondo',
    format: 5,
    surfaceType: 'cement',
    isCovered: false,
    priceCents: 2000000,
  },
])

/**
 * `createWizardCourtsAction` es una Server Action ('use server') — entra por
 * prop, nunca importada (ver comentario en StepIdentity.tsx / regla del repo).
 *
 * Desde el split panel (Fase 3), `StepCourts` arma su propio `<WizardShell>`
 * con preview (`GridPreview`) — `fullscreen`, sin decorator: el shell pone el
 * `card-premium` solo.
 */
const meta = {
  title: 'Onboarding/StepCourts',
  component: StepCourts,
  parameters: { layout: 'fullscreen' },
  args: {
    existingCourts: [],
    tenantId: 'sb-default',
    createCourtsAction: fn(async () => ({ success: true as const })),
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
  args: { existingCourts: [courtFutbol5(), courtFutbol7()], tenantId: conCanchas },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const resumen = canvas.getByText('Estas ya están creadas — las editás después desde Canchas.')
    await expect(resumen).toBeInTheDocument()
    // Scopeado al contenedor de ExistingCourtsList: "Cancha 1"/"Cancha 2"
    // también aparecen como columnas en el preview (GridPreview, ×2 por el
    // split desktop/mobile de PreviewPane).
    const lista = within(resumen.parentElement!)
    await expect(lista.getByText('Cancha 1', { exact: true })).toBeInTheDocument()
    await expect(lista.getByText('Cancha 2', { exact: true })).toBeInTheDocument()
    // Sin borradores nuevos todavía: ningún campo "Nombre" editable en pantalla.
    await expect(canvas.queryByLabelText('Nombre *')).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: /agregar otra cancha/i }))
    await expect(canvas.getByLabelText('Nombre *')).toHaveValue('Cancha 3')
  },
}

/** "+ Agregar otra" duplica la anterior — el caso real es N canchas iguales. */
export const VariosBorradores: Story = {
  args: { tenantId: varios },
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
  args: { tenantId: errorPrecio },
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
  args: { createCourtsAction: fn(enviandoCanchas.action), tenantId: enviando },
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

/**
 * Vuelve al paso con canchas a medio cargar: antes eran `useState` puro y
 * cerrar la pestaña con seis canchas tipeadas te devolvía a cero. Se restauran
 * plegadas, con el precio ya puesto.
 */
export const RestauraBorradoresGuardados: Story = {
  args: { tenantId: restaura },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Los dos borradores vuelven con sus datos. Se buscan por campo y no por
    // texto porque el nombre aparece dos veces por tarjeta (el <legend> sr-only
    // y la fila-resumen).
    const nombres = await canvas.findAllByLabelText('Nombre *')
    await expect(nombres).toHaveLength(2)
    await expect(nombres[0]).toHaveValue('Cancha techada')
    await expect(nombres[1]).toHaveValue('Cancha del fondo')

    // La segunda vuelve PLEGADA (botón "Editar"; la abierta dice "Listo"), con
    // el precio a la vista en la fila-resumen: seis formularios desplegados al
    // volver es peor que seis filas de resumen con los datos adentro. Ojo: el
    // colapso es CSS —`grid-rows-[0fr]`—, así que el form sigue en el DOM y no
    // sirve para distinguir una tarjeta de la otra.
    await expect(canvas.getByRole('button', { name: 'Listo' })).toBeInTheDocument()
    const editarBtn = canvas.getByRole('button', { name: /editar/i })
    await expect(editarBtn).toBeInTheDocument()
    // Scopeado a la tarjeta colapsada: el precio también aparece en el
    // preview (GridPreview, ×2 por el split desktop/mobile de PreviewPane).
    const tarjetaColapsada = within(editarBtn.closest('fieldset')!)
    await expect(tarjetaColapsada.getByText('$ 20.000')).toBeInTheDocument()
  },
}

/** Basura en el storage no rompe el paso: cae al borrador vacío de siempre. */
export const IgnoraBorradoresCorruptos: Story = {
  args: { tenantId: corruptos },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Nombre *')).toHaveValue('Cancha 1')
  },
}

/**
 * "Volver" es un link al paso anterior, no una Server Action: ahora que el paso
 * vive en la URL, retroceder es navegar. Ya no hay estado pendiente que esperar.
 */
export const VolverEsUnLink: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const back = canvas.getByRole('link', { name: /^volver$/i })
    await expect(back).toHaveAttribute('href', '/onboarding/horarios')
  },
}
