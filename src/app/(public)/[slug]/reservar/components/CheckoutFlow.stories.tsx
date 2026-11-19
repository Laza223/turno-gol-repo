import type { ComponentProps } from 'react'
import '@/components/booking/reserva.css'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, waitFor, within } from 'storybook/test'
import PortalFrame from '@/components/site/PortalFrame'
import PortalHeader from '@/components/site/PortalHeader'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import SiteFooter from '@/components/site/SiteFooter'
import ReservaShell from '@/components/booking/ReservaDarkShell'
import BookingSummary, { type BookingSummaryData } from './BookingSummary'
import CheckoutFlow from './CheckoutFlow'

const summary: BookingSummaryData = {
  tenantName: 'El Vagón',
  address: 'Av. Siempreviva 742',
  city: 'Moreno',
  courtName: 'Cancha 2',
  courtFormat: 5,
  date: '2026-03-14',
  timeStart: '21:00',
  timeEnd: '22:00',
  price: 1500000,
  depositAmount: 0,
}

const signOut = fn(async () => {})

/** La pantalla de confirmar completa: lo que arma `reservar/page.tsx` debajo del "Volver" y el título. */
function Screen(props: ComponentProps<typeof CheckoutFlow> & { summary: BookingSummaryData }) {
  const { summary: data, ...flow } = props
  return (
    <ReservaShell className="rv-stack">
      <h1 className="rv-h2">Confirmá tu reserva</h1>
      <BookingSummary data={data} />
      <CheckoutFlow {...flow} hidePrices={data.hidePrices} />
    </ReservaShell>
  )
}

const meta = {
  title: 'Player/Checkout/CheckoutFlow',
  component: CheckoutFlow,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/el-vagon/reservar' } },
  },
  args: {
    slug: 'el-vagon',
    court: '00000000-0000-4000-8000-000000000102',
    date: '2026-03-14',
    time: '21:00',
    dur: 60,
    formato: 5,
    pay: null,
    withDeposit: false,
    cancellationHours: 12,
    isPlayer: true,
    inAppBrowser: false,
    createAction: fn(async () => undefined),
    sendLinkAction: fn(async () => ({ status: 'idle' as const })),
    googleAction: fn(async () => ({ status: 'idle' as const })),
  },
  render: (args) => <Screen {...args} summary={summary} />,
  decorators: [
    (Story, ctx) => (
      <>
        <PortalSessionProvider
          initialValue={{
            // `sesionHidratada: false`: el servidor sabe que es jugador pero la sesión del cliente
            // todavía no llegó (se hidrata con un fetch). El botón fijo y el marco no deben saltar.
            session:
              ctx.args.isPlayer && ctx.parameters['sesionHidratada'] !== false
                ? {
                    playerId: 'p1',
                    firstName: 'Tomás',
                    lastName: 'Ibáñez',
                    avatarUrl: null,
                    email: 'tomas@example.com',
                  }
                : null,
            favoriteTenantIds: new Set(),
            staffPanelPath: null,
          }}
        >
          {/* El marco real: es quien reserva el alto de la barra inferior y de la barra fija. */}
          <PortalFrame header={<PortalHeader signOutAction={signOut} />} footer={<SiteFooter />}>
            <Story />
          </PortalFrame>
        </PortalSessionProvider>
      </>
    ),
  ],
} satisfies Meta<typeof CheckoutFlow>

export default meta
type Story = StoryObj<typeof meta>

/** El Vagón: precios ocultos, sin seña, F5; con sesión. Un solo botón "Reservar" y ningún "$". */
export const ElVagonConSesion: Story = {
  render: (args) => <Screen {...args} summary={{ ...summary, hidePrices: true }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvasElement.textContent).not.toContain('$')
    const court = canvas.getByText(/^Cancha 2/)
    await expect(court).toBeVisible()
    await expect(court).toHaveTextContent('Cancha 2 · Fútbol 5')
    await expect(canvas.getByText('Podés cancelar desde Mis reservas.')).toBeVisible()
    await expect(canvas.queryByText(/Cómo pagás/)).not.toBeInTheDocument()
    await expect(canvas.queryByRole('radio')).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Reservar' })).toBeEnabled()
  },
}

/**
 * Vuelve del ingreso con el vínculo verificado (sin seña): el form se envía solo, una vez, con el
 * vínculo en un campo oculto, y el botón queda visible. La action es un mock: acá se ve el envío.
 * El "Confirmando…" entra en un lugar que ya estaba reservado (nada se mueve).
 */
export const ConfirmaSola: Story = {
  args: { autoConfirmToken: 'eyJzbHVnIjoiY2x1Yi14In0.firma-de-ejemplo-0123456789abcdefghij' },
  render: (args) => <Screen {...args} summary={{ ...summary, hidePrices: true }} />,
  decorators: [
    (Story) => {
      // La marca de "ya se envió" vive en sessionStorage y sobrevive a una nueva corrida en la misma
      // pestaña: se limpia ANTES de montar, o el re-run no enviaría nada. (En este runner `beforeEach`
      // corre después del primer render.)
      for (const key of Object.keys(window.sessionStorage)) {
        if (key.startsWith('tg-auto-confirm:')) window.sessionStorage.removeItem(key)
      }
      return <Story />
    },
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(args.createAction).toHaveBeenCalledTimes(1))
    await expect(canvas.getByRole('button', { name: /Reservar|Procesando/ })).toBeVisible()
    const form = canvasElement.querySelector('form')!
    await expect(form.querySelector('input[type="hidden"][name="booking_intent"]')).toHaveValue(
      args.autoConfirmToken,
    )

    // Sin salto de layout: el mismo nodo vacío, como llega del servidor, mide lo mismo que con el
    // texto puesto, y ese alto es el reservado (1,5 rem = la línea de 16 px).
    const status = canvas.getByRole('status')
    await waitFor(() => expect(status).toHaveTextContent('Confirmando tu reserva…'))
    const empty = status.cloneNode(false) as HTMLElement
    status.after(empty)
    const emptyHeight = empty.getBoundingClientRect().height
    empty.remove()
    await expect(status.getBoundingClientRect().height).toBe(emptyHeight)
    await expect(emptyHeight).toBe(parseFloat(getComputedStyle(status).minHeight))
    await expect(getComputedStyle(status).fontSize).toBe('16px')
  },
}

/**
 * Volvió con un vínculo que no valió (vencido, de otro email o de otro turno), sin seña: la pantalla
 * normal, con una línea corta que pide tocar el botón. Nada se envía solo.
 */
export const VinculoQueNoValio: Story = {
  args: { intentDegraded: true },
  render: (args) => <Screen {...args} summary={{ ...summary, hidePrices: true }} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const line = canvas.getByText('Tocá "Reservar" para terminar tu reserva.')
    await expect(line).toBeVisible()
    await expect(getComputedStyle(line).fontSize).toBe('16px')
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Reservar' })).toBeEnabled()
    await expect(args.createAction).not.toHaveBeenCalled()
  },
}

/** Lo mismo sin sesión: en lugar del botón, el ingreso (Google y email) dentro de la pantalla. */
export const ElVagonSinSesion: Story = {
  args: { isPlayer: false },
  render: (args) => <Screen {...args} summary={{ ...summary, hidePrices: true }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvasElement.textContent).not.toContain('$')
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Reservar' })).not.toBeInTheDocument()
    const panel = within(canvas.getByRole('region', { name: 'Entrá para reservar' }))
    await expect(panel.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled()
    await expect(panel.getByRole('button', { name: 'Continuar con mi email' })).toBeEnabled()
    await expect(canvas.getByText('Podés cancelar desde Mis reservas.')).toBeVisible()
  },
}

/** Con seña y precios visibles: MercadoPago, la seña a la vista y la regla de cancelación. */
export const ConSenaYPrecios: Story = {
  args: {
    withDeposit: true,
    depositAmount: 450000,
    formato: null,
  },
  render: (args) => <Screen {...args} summary={{ ...summary, depositAmount: 450000 }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Seña a pagar ahora')).toBeVisible()
    await expect(
      canvas.getByText(
        /Si cancelás con más de 12 horas de anticipación, el complejo te devuelve la seña/,
      ),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: /^Pagar seña · \$/ })).toBeEnabled()
  },
}

/** Con seña y precios ocultos, sin sesión, en el navegador interno de Instagram. */
export const ConSenaOcultaNavegadorInterno: Story = {
  args: {
    withDeposit: true,
    isPlayer: false,
    inAppBrowser: true,
    cancellationHours: 24,
  },
  render: (args) => (
    <Screen {...args} summary={{ ...summary, depositAmount: 450000, hidePrices: true }} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvasElement.textContent).not.toContain('$')
    // El resumen no dice cómo se paga; lo dice la nota debajo del ingreso.
    await expect(
      canvas.getByText('Pagás una seña online con MercadoPago; el resto, en el complejo.'),
    ).toBeVisible()
    // En el navegador de Instagram el email va primero y Google, que abre el navegador, después.
    const panel = within(canvas.getByRole('region', { name: 'Entrá para reservar' }))
    await expect(panel.getAllByRole('button')[0]).toHaveTextContent('Continuar con mi email')
    await expect(panel.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
    await expect(
      panel.getByText('Te abrimos tu navegador para que entres con Google.'),
    ).toBeVisible()
  },
}

/**
 * Con sesión, en un celular de 390 px (`reservar.html`): el botón va en el flujo, debajo del
 * resumen, y a la vista sin bajar. No es una barra fija: el marco solo reserva la barra inferior
 * (78 px: 12 de aire + 66 de píldora), sin los 77 px que sumaba la barra de confirmar.
 */
export const BotonEnElFlujoEnElCelular: Story = {
  globals: { viewport: { value: 'celular390', isRotated: false } },
  parameters: {
    viewport: {
      options: {
        celular390: { name: 'celular 390', styles: { width: '390px', height: '844px' } },
      },
    },
  },
  render: (args) => <Screen {...args} summary={{ ...summary, hidePrices: true }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(window.innerWidth).toBe(390)
    await expect(canvasElement.querySelector('[data-fixed-cta]')).toBeNull()
    const button = canvas.getByRole('button', { name: 'Reservar' })
    await expect(getComputedStyle(button).position).not.toBe('fixed')
    const frame = button.closest('[data-portal-glass]')!
    await expect(getComputedStyle(frame).paddingBottom).toBe('78px')
    // A la vista sin bajar, por encima de la barra inferior.
    const nav = canvasElement.querySelector('nav[aria-label="Navegación del jugador"]')!
    await expect(button.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      nav.getBoundingClientRect().top,
    )
  },
}

/** Desde `md` no hay barra inferior: el marco no reserva nada abajo. */
export const BotonEnElFlujoDesdeMd: Story = {
  globals: { viewport: { value: 'tablet', isRotated: false } },
  render: (args) => <Screen {...args} summary={{ ...summary, hidePrices: true }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(window.innerWidth).toBe(768)
    await expect(canvasElement.querySelector('[data-fixed-cta]')).toBeNull()
    const frame = canvas.getByRole('button', { name: 'Reservar' }).closest('[data-portal-glass]')!
    await expect(getComputedStyle(frame).paddingBottom).toBe('0px')
  },
}
