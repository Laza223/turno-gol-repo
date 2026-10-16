import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PortalAuthFrame } from '@/components/world/PortalAuthFrame'
import { paintedContrast } from '@/test/contrast'
import { pendingAction } from '@/test/pending-action'
import { IngresarForm, type PlayerLoginAction } from './IngresarForm'

const noopGoogleAction = fn(async () => {})

type PlayerLoginState = Awaited<ReturnType<PlayerLoginAction>>

/**
 * La Server Action entra por prop (ver el comentario en IngresarForm.tsx).
 * El decorator pone el mismo marco que /ingresar (page.tsx): el mundo del portal, el logo
 * arriba y una columna de 24 rem. Los tokens del mundo se resuelven en <html>, así que el
 * contraste se mide en los dos temas.
 */
const meta = {
  title: 'Auth/IngresarForm',
  component: IngresarForm,
  args: { googleAction: noopGoogleAction },
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/ingresar' } },
  },
  decorators: [
    (Story) => (
      <PortalAuthFrame>
        <Story />
      </PortalAuthFrame>
    ),
  ],
} satisfies Meta<typeof IngresarForm>

export default meta
type Story = StoryObj<typeof meta>

// Los botones en orden de DOM: es el orden en que los recorren el teclado y el lector de pantalla.
const buttonNames = (root: HTMLElement) =>
  within(root)
    .getAllByRole('button')
    .map((b) => b.textContent)

/**
 * Un link en línea mide lo que el renglón: llega a 44 px con padding vertical, que no mueve el
 * layout. Si el texto salta de renglón son DOS fragmentos y cada uno tiene que llegar; y esa área
 * no puede pisar ni rozar a ningún botón: tiene que quedar aire.
 */
const expectTouchTarget = async (link: HTMLElement, root: HTMLElement) => {
  await root.ownerDocument.fonts.ready
  const fragments = Array.from(link.getClientRects())
  await expect(fragments.length).toBeGreaterThan(0)
  for (const fragment of fragments) {
    await expect(fragment.height).toBeGreaterThanOrEqual(44)
    for (const button of root.querySelectorAll('button')) {
      const b = button.getBoundingClientRect()
      await expect(fragment.bottom < b.top || fragment.top > b.bottom).toBe(true)
    }
  }
}

export const Idle: Story = {
  args: { action: fn(async () => ({ status: 'idle' as const })) },
  play: async ({ canvasElement }) => {
    await expect(buttonNames(canvasElement)).toEqual(['Continuar con Google', 'Mandame el enlace'])
    const explore = within(canvasElement).getByRole('link', { name: /Descubrí complejos/ })
    await expect(explore).toHaveAttribute('href', '/explorar')
    await expectTouchTarget(explore, canvasElement)
    // El placeholder es el ejemplo del formato: axe no lo mide, y con el /60 de ui/input.tsx daba 2,87:1.
    const email = within(canvasElement).getByLabelText('Email')
    await expect(email).toHaveAttribute('placeholder', 'vos@email.com')
    await expect(await paintedContrast(email, '::placeholder')).toBeGreaterThanOrEqual(4.5)
  },
}

/** Instagram, Facebook o TikTok (lo decide el servidor): primero el email y la aclaración de Google. */
export const NavegadorInterno: Story = {
  args: { action: fn(async () => ({ status: 'idle' as const })), inAppBrowser: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(buttonNames(canvasElement)).toEqual(['Mandame el enlace', 'Continuar con Google'])
    await expect(canvas.getByText(/Google puede no abrirse/)).toBeVisible()
  },
}

/** ?deleted=1: aviso de cuenta eliminada (DeleteAccountForm → /ingresar?deleted=1). */
export const CuentaEliminada: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/ingresar', query: { deleted: '1' } } },
  },
  args: { action: fn(async () => ({ status: 'idle' as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Tu cuenta fue eliminada')).toBeInTheDocument()
  },
}

export const Error: Story = {
  args: {
    action: fn(async () => ({
      status: 'error' as const,
      message: 'Ingresá un email válido.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Mandame el enlace' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Ingresá un email válido.')
    await expect(canvas.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  },
}

const enviando = pendingAction<PlayerLoginState>({ status: 'idle' })

export const Enviando: Story = {
  args: {
    // Se libera al final del play: una promesa que nunca resuelve deja viva una
    // transición de React que le rompe las stories siguientes (pending-action.ts).
    action: fn(enviando.action),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText(/email/i), 'tomas@example.com')
    await userEvent.click(canvas.getByRole('button', { name: 'Mandame el enlace' }))
    try {
      await expect(await canvas.findByText('Enviando…')).toBeInTheDocument()
      const pending = canvas.getByRole('button', { name: /envia/i })
      // Pendiente no es apagado: la etiqueta es la única señal de que el toque entró.
      await expect(await paintedContrast(pending)).toBeGreaterThanOrEqual(4.5)
      // Y no recibe otro toque. React encola los que llegan con la action en vuelo y los manda al
      // liberarla: un segundo envío no se ve desde acá, solo lo evita el botón deshabilitado.
      await expect(pending).toBeDisabled()
    } finally {
      // Si una aserción falla, igual se libera: la action colgada rompería las stories siguientes.
      // Sin buscar el botón: si no está (otra etiqueta), el getByRole tiraría antes de liberar.
      await enviando.release()
    }
  },
}

/**
 * state.status === 'sent': la action contesta "sent" aunque ese email no tenga cuenta, así que el
 * texto dice "si tiene cuenta". Abajo, el bloque de primera vez con el mismo botón de Google.
 */
export const Enviado: Story = {
  args: {
    action: fn(async () => ({ status: 'sent' as const, email: 'tomas.ibanez@example.com' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Mandame el enlace' }))
    const title = await canvas.findByRole('heading', { level: 1, name: 'Revisá tu email' })
    await expect(title).toHaveFocus()
    await expect(canvas.getByText('tomas.ibanez@example.com').closest('p')).toHaveTextContent(
      'Si tomas.ibanez@example.com tiene cuenta, te enviamos un enlace para entrar.',
    )
    const resend = canvas.getByRole('button', { name: /^Reenviar en \d+ s$/ })
    await expect(resend).toBeDisabled()
    // Deshabilitado no es ilegible: axe no mide los controles deshabilitados, esto sí.
    await expect(await paintedContrast(resend)).toBeGreaterThanOrEqual(4.5)
    await expect(canvas.getByRole('button', { name: 'Usar otro email' })).toBeEnabled()
    const firstTime = canvas.getByRole('link', { name: 'reservá tu primer turno' })
    await expect(firstTime).toHaveAttribute('href', '/explorar')
    await expect(firstTime.closest('p')).toHaveTextContent(
      '¿Primera vez? Entrá con Google o reservá tu primer turno: la cuenta se crea sola.',
    )
    await expectTouchTarget(firstTime, canvasElement)
    await expect(canvas.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled()
  },
}

/** En el navegador interno el bloque de primera vez no ofrece Google: puede no abrir. */
export const EnviadoNavegadorInterno: Story = {
  args: {
    action: fn(async () => ({ status: 'sent' as const, email: 'tomas.ibanez@example.com' })),
    inAppBrowser: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Mandame el enlace' }))
    await canvas.findByRole('heading', { level: 1, name: 'Revisá tu email' })
    const firstTime = canvas.getByRole('link', { name: 'Reservá tu primer turno' })
    await expect(firstTime).toHaveAttribute('href', '/explorar')
    await expect(firstTime.closest('p')).toHaveTextContent(
      '¿Primera vez? Reservá tu primer turno y la cuenta se crea sola.',
    )
    await expectTouchTarget(firstTime, canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Continuar con Google' })).toBeNull()
  },
}

/** Sin conexión la action rechaza: mensaje en el formulario, email conservado, sin cartel de error. */
export const SinConexion: Story = {
  args: {
    action: fn(async () => {
      throw new TypeError('Failed to fetch')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Email'), 'tomas@example.com')
    await userEvent.click(canvas.getByRole('button', { name: 'Mandame el enlace' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'No pudimos enviar el enlace. Revisá tu conexión e intentá de nuevo.',
    )
    const email = canvas.getByLabelText('Email')
    await expect(email).toHaveValue('tomas@example.com')
    await expect(email).not.toHaveAttribute('aria-invalid')
    await expect(canvas.getByRole('button', { name: 'Mandame el enlace' })).toBeEnabled()
  },
}

/** Un email largo se parte en vez de romper el ancho de la columna. */
export const EnviadoEmailLargo: Story = {
  args: {
    action: fn(async () => ({
      status: 'sent' as const,
      email:
        'nombre.apellido.con.muchos.puntos.y.palabras@un-dominio-institucional-muy-largo.com.ar',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Mandame el enlace' }))
    await canvas.findByRole('heading', { level: 1, name: 'Revisá tu email' })
    const root = canvasElement.ownerDocument.documentElement
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
  },
}

/** "Usar otro email" vuelve al formulario con el campo enfocado y el email anterior seleccionado. */
export const UsarOtroEmail: Story = {
  args: {
    action: fn(async () => ({ status: 'sent' as const, email: 'tomas.ibanez@example.com' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Mandame el enlace' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Usar otro email' }))
    const email = canvas.getByLabelText('Email')
    await expect(email).toHaveFocus()
    await expect(email).toHaveValue('tomas.ibanez@example.com')
  },
}
