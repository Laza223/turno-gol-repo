import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { RivalFormResult } from './actions'
import type { RivalPhotoResult } from './photo-actions'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { WelcomeCard } from './WelcomeCard'

const meta = {
  title: 'Player/Rival/WelcomeCard',
  component: WelcomeCard,
  parameters: { layout: 'padded' },
  args: {
    needs: { identity: true, profile: false, position: false },
    defaultName: 'Lazaro',
    action: fn(async (): Promise<RivalFormResult> => ({ success: true })),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-lg bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WelcomeCard>

export default meta
type Story = StoryObj<typeof meta>

/** Para armar: el nombre y las reglas. Ni posición ni zona, ni la frase del organizador. */
export const Armar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Tu nombre')).toHaveValue('Lazaro')
    await expect(canvas.getByText('Llegá a horario.')).toBeInTheDocument()
    await expect(
      canvas.getAllByRole('button', { name: 'Aceptar y armar mi partido' }),
    ).toHaveLength(1)
    // El clickwrap de la spec §7, debajo del botón.
    await expect(canvas.getByText(/Al tocar, aceptás las reglas de RIVAL/)).toBeInTheDocument()
    await expect(canvas.queryByText(/El organizador ve además/)).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('input[name="position"]')).toBeNull()
    await expect(canvasElement.querySelector('[name="zone"]')).toBeNull()
    // Sin la prop `photo` la tarjeta no ofrece foto; sin salida no hay "Ahora no".
    await expect(canvas.queryByRole('button', { name: 'Subir foto' })).not.toBeInTheDocument()
    await expect(canvas.queryByText('Ahora no')).not.toBeInTheDocument()
  },
}

/** Sumarse siendo nuevo: todo, y la frase del organizador vuelve al párrafo. */
export const SumarseNuevo: Story = {
  args: {
    needs: { identity: true, profile: true, position: true },
    submitLabel: 'Estoy adentro',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Para sumarte, contanos quién sos.')).toBeInTheDocument()
    await expect(canvas.queryByText('Quién sos')).not.toBeInTheDocument()
    await expect(canvas.getByLabelText('Tu nombre')).toBeInTheDocument()
    await expect(canvas.getByLabelText('Tu posición')).toBeInTheDocument()
    await expect(canvasElement.querySelector('[name="zone"]')).not.toBeNull()
    await expect(canvas.getByText('Las reglas de RIVAL')).toBeInTheDocument()
    await expect(canvas.getByText(/El organizador ve además tu posición y tu zona/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Estoy adentro' })).toBeInTheDocument()
  },
}

/**
 * El caso "both" a 390 al sumarse por link: sin foto, el botón fijo abajo y la posición en select.
 * La tarjeta entera tiene que medir bastante menos que antes (902 px) y el nombre, la posición y la
 * zona entrar en la primera pantalla.
 */
export const SumarseNuevoCelular: Story = {
  args: {
    needs: { identity: true, profile: true, position: true },
    submitLabel: 'Estoy adentro',
    pinSubmit: true,
  },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  decorators: [
    (Story) => (
      <div className="mx-auto w-[390px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('group', { name: 'Para el organizador' })).toBeInTheDocument()
    await expect(canvas.queryByText('Quién sos')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /foto/i })).not.toBeInTheDocument()
    await expect(canvas.getByText('Las reglas de RIVAL')).toBeVisible()
    await expect(canvas.getByText(/Quien tenga el link de un partido/)).toBeVisible()
    const card = canvasElement.querySelector('section')!.getBoundingClientRect()
    console.info('WelcomeCard both 390 altura:', Math.round(card.height))
    await expect(card.height).toBeLessThanOrEqual(760)
    // Nombre, posición y zona entran en la primera pantalla (844) sin quedar bajo la barra fija.
    const zone = canvasElement.querySelector('#rival-zona')!.getBoundingClientRect()
    await expect(zone.bottom).toBeLessThanOrEqual(844 - 120)
    // Un solo botón que acepta, en la barra fija, con la línea corta encima.
    const bar = canvasElement.querySelector('[data-fixed-cta]')!
    await expect(
      within(bar as HTMLElement).getByRole('button', { name: 'Estoy adentro' }),
    ).toBeEnabled()
    await expect(bar).toHaveTextContent('Al tocar, aceptás las reglas de RIVAL.')
    await expect(canvas.getAllByRole('button', { name: 'Estoy adentro' })).toHaveLength(1)
  },
}

/** Capitán nuevo de un equipo rival: nombre y reglas, y del organizador solo la zona. */
export const CapitanNuevo: Story = {
  args: {
    needs: { identity: true, profile: true, position: false },
    submitLabel: 'Pedir jugar',
    intro: 'Para pedir jugar con tu equipo, contanos quién sos.',
    pinSubmit: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Tu nombre')).toBeInTheDocument()
    await expect(canvas.queryByLabelText('Tu posición')).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('[name="position"]')).toBeNull()
    await expect(canvasElement.querySelector('[name="zone"]')).not.toBeNull()
    await expect(canvas.getByText(/El organizador ve además tu posición y tu zona\./)).toBeVisible()
  },
}

/** Capitán que ya aceptó las reglas: solo la zona, con su bajada propia. */
export const CapitanSoloZona: Story = {
  args: {
    needs: { identity: false, profile: true, position: false },
    submitLabel: 'Pedir jugar',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(
        'Elegí tu zona. El organizador la ve para coordinar el partido. Lo pedimos una sola vez.',
      ),
    ).toBeVisible()
    await expect(canvas.queryByLabelText('Tu posición')).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('[name="position"]')).toBeNull()
    await expect(canvasElement.querySelector('[name="zone"]')).not.toBeNull()
  },
}

/** Re-aceptación de las reglas con el perfil ya cargado: solo nombre y reglas. */
export const ReaceptarReglas: Story = {
  args: {
    submitLabel: 'Estoy adentro',
    intro: 'Para sumarte, confirmá tu nombre y aceptá las reglas.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Para sumarte, confirmá tu nombre y aceptá las reglas.'),
    ).toBeInTheDocument()
    await expect(canvas.queryByRole('radiogroup', { name: 'Tu posición' })).not.toBeInTheDocument()
    await expect(canvas.queryByText(/El organizador ve además/)).not.toBeInTheDocument()
  },
}

/** Ya aceptó las reglas y le falta posición y zona: solo eso, sin reglas ni nombre. */
export const SoloPerfil: Story = {
  args: {
    needs: { identity: false, profile: true, position: true },
    submitLabel: 'Pedir sumarme',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Un dato más para sumarte' })).toBeVisible()
    await expect(canvas.getByLabelText('Tu posición')).toBeInTheDocument()
    await expect(canvas.queryByRole('radiogroup')).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('[name="zone"]')).not.toBeNull()
    await expect(canvas.queryByLabelText('Tu nombre')).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('input[name="firstName"]')).toBeNull()
    await expect(canvas.queryByText('Las reglas de RIVAL')).not.toBeInTheDocument()
    await expect(canvas.queryByText(/Al tocar, aceptás/)).not.toBeInTheDocument()
    await expect(
      canvas.getByText(/El organizador ve además tu posición y tu zona/),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Pedir sumarme' })).toBeInTheDocument()
  },
}

/** Con algo de perfil ya cargado (un valor a medias) llega precargado. */
export const ConPerfilPrevio: Story = {
  args: {
    needs: { identity: false, profile: true, position: true },
    submitLabel: 'Estoy adentro',
    defaultPosition: 'goalkeeper',
    defaultZone: 'Luján',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('input[name="position"]')).toHaveValue('goalkeeper')
    await expect(canvasElement.querySelector('[name="zone"]')).toHaveValue('Luján')
  },
}

/** Con `onDismiss` hay salida en el lugar: "Ahora no" no envía nada y avisa al padre. */
export const AhoraNoBoton: Story = {
  args: { onDismiss: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const ahoraNo = canvas.getByRole('button', { name: 'Ahora no' })
    await expect(ahoraNo.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    await userEvent.click(ahoraNo)
    await expect(args.onDismiss).toHaveBeenCalledTimes(1)
    await expect(args.action).not.toHaveBeenCalled()
  },
}

/** Con `dismissHref` (la tarjeta es la página) la salida es un link. */
export const AhoraNoLink: Story = {
  args: { dismissHref: '/rival' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'Ahora no' })).toHaveAttribute(
      'href',
      '/rival',
    )
  },
}

/** Abierta por un toque: el foco cae en el título, no en el campo (no abre el teclado). */
export const FocoAlAbrir: Story = {
  args: { focusOnMount: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByRole('heading', { name: 'Bienvenido a RIVAL' })).toHaveFocus(),
    )
    await expect(canvas.getByLabelText('Tu nombre')).not.toHaveFocus()
  },
}

export const ConErrorDelServidor: Story = {
  args: {
    needs: { identity: true, profile: true, position: true },
    action: fn(async (): Promise<RivalFormResult> => ({
      success: false,
      error: 'Ingresá tu nombre.',
      field: 'firstName',
      fieldErrors: { firstName: 'Ingresá tu nombre.', zone: 'Elegí tu zona' },
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Aceptar y seguir' }))
    // Los dos errores salen juntos, cada uno junto a su campo.
    await expect(await canvas.findByText('Ingresá tu nombre.')).toBeInTheDocument()
    await expect(canvas.getByText('Elegí tu zona', { selector: 'p' })).toBeInTheDocument()
    await expect(canvas.getByLabelText('Tu nombre')).toHaveAttribute('aria-invalid', 'true')
    // El form no se resetea: el nombre sigue y el botón se puede volver a tocar.
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Aceptar y seguir' })).toBeEnabled(),
    )
    await expect(canvas.getByLabelText('Tu nombre')).toHaveValue('Lazaro')
  },
}

/** Sin red la action rechaza: el error sale en la tarjeta, no en el boundary, y lo tipeado queda. */
export const SinRed: Story = {
  args: {
    action: fn(async (): Promise<RivalFormResult> => {
      throw new Error('Failed to fetch')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Aceptar y armar mi partido' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'No pudimos conectar. Revisá tu conexión y probá de nuevo.',
    )
    await expect(canvas.getByLabelText('Tu nombre')).toHaveValue('Lazaro')
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Aceptar y armar mi partido' })).toBeEnabled(),
    )
  },
}

/** Sesión vencida: el error trae la salida ("Ingresar"). */
export const SesionVencida: Story = {
  args: {
    action: fn(async (): Promise<RivalFormResult> => ({
      success: false,
      error: 'Ingresá a tu cuenta para seguir.',
      code: 'no_session',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Aceptar y armar mi partido' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Ingresá a tu cuenta para seguir.',
    )
    await expect(canvas.getByRole('link', { name: 'Ingresar' })).toBeInTheDocument()
  },
}

const PHOTO = {
  url: null,
  uploadAction: fn(async (): Promise<RivalPhotoResult> => ({ success: true, url: null })),
  removeAction: fn(async (): Promise<RivalPhotoResult> => ({ success: true, url: null })),
}

/** Con storage configurado: la foto opcional, una fila baja bajo el nombre. */
export const ConFoto: Story = {
  args: { photo: PHOTO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: 'Agregar foto (opcional)' }),
    ).toBeInTheDocument()
    // Subir la foto no envía el form: el botón que acepta sigue siendo uno solo.
    await expect(
      canvas.getAllByRole('button', { name: 'Aceptar y armar mi partido' }),
    ).toHaveLength(1)
  },
}

export const ConFotoCargada: Story = {
  args: {
    photo: {
      ...PHOTO,
      url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><rect width='8' height='8' fill='%2310b981'/></svg>",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Cambiar foto' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Quitar' })).toBeInTheDocument()
  },
}

/** La foto es del bloque de identidad: quien solo completa el perfil no la ve. */
export const SoloPerfilSinFoto: Story = {
  args: { needs: { identity: false, profile: true, position: true }, photo: PHOTO },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('button', { name: 'Agregar foto (opcional)' }),
    ).not.toBeInTheDocument()
  },
}
