import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import PortalFrame from '@/components/site/PortalFrame'
import PortalHeader from '@/components/site/PortalHeader'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import SiteFooter from '@/components/site/SiteFooter'
import { PORTAL_TITLE } from '@/components/world/PortalAuthFrame'
import { PortalWorld } from '@/components/world/PortalWorld'
import { RESERVAR_COLUMN } from '../CheckoutStates'
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
    <div className={`${RESERVAR_COLUMN} pb-12`}>
      <h1 className={PORTAL_TITLE}>Confirmá tu reserva</h1>
      <div className="mt-6 space-y-8">
        <BookingSummary data={data} />
        <CheckoutFlow {...flow} hidePrices={data.hidePrices} />
      </div>
    </div>
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
    methods: ['cash', 'transfer'],
    initialPay: 'cash',
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
      <PortalWorld>
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
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof CheckoutFlow>

export default meta
type Story = StoryObj<typeof meta>

/** El Vagón: precios ocultos, sin seña, efectivo o transferencia, F5; con sesión. Ningún "$". */
export const ElVagonConSesion: Story = {
  render: (args) => <Screen {...args} summary={{ ...summary, hidePrices: true }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvasElement.textContent).not.toContain('$')
    const court = canvas.getByText(/^Cancha 2/)
    await expect(court).toBeVisible()
    await expect(court).toHaveTextContent('Cancha 2 · Fútbol 5')
    await expect(canvas.getByText('Podés cancelar desde Mis reservas.')).toBeVisible()
    await userEvent.click(canvas.getByText('Transferencia'))
    await expect(canvas.getByRole('radio', { name: /transferencia/i })).toBeChecked()
    await expect(canvas.getByRole('button', { name: 'Confirmar reserva' })).toBeEnabled()
  },
}

/**
 * Vuelve del ingreso con el vínculo verificado (sin seña): el form se envía solo, una vez, con el
 * vínculo en un campo oculto, y el botón queda visible. La action es un mock: acá se ve el envío.
 * El "Confirmando…" entra en un lugar que ya estaba reservado (nada se mueve) y el selector de pago
 * se bloquea: un cambio ahí ya no se aplicaría.
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
    await expect(canvas.getByRole('button', { name: /Confirmar reserva|Procesando/ })).toBeVisible()
    const form = canvasElement.querySelector('form')!
    await expect(form.querySelector('input[type="hidden"][name="booking_intent"]')).toHaveValue(
      args.autoConfirmToken,
    )
    await expect(canvas.getByRole('radio', { name: /efectivo/i })).toBeDisabled()
    await expect(canvas.getByRole('radio', { name: /transferencia/i })).toBeDisabled()

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
 * normal, con una línea corta que pide tocar el botón. Nada se envía solo y el selector queda libre.
 */
export const VinculoQueNoValio: Story = {
  args: { intentDegraded: true },
  render: (args) => <Screen {...args} summary={{ ...summary, hidePrices: true }} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const line = canvas.getByText('Tocá Confirmar reserva para terminar.')
    await expect(line).toBeVisible()
    await expect(getComputedStyle(line).fontSize).toBe('16px')
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Confirmar reserva' })).toBeEnabled()
    await expect(canvas.getByRole('radio', { name: /efectivo/i })).toBeEnabled()
    await expect(args.createAction).not.toHaveBeenCalled()
  },
}

/** Lo mismo sin sesión: el ingreso (casilla, Google, email) en lugar del botón. */
export const ElVagonSinSesion: Story = {
  args: { isPlayer: false },
  render: (args) => <Screen {...args} summary={{ ...summary, hidePrices: true }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvasElement.textContent).not.toContain('$')
    await expect(canvas.getByRole('heading', { name: 'Entrá para reservar' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled()
  },
}

/** Con seña y precios visibles: MercadoPago, la seña a la vista y la regla de cancelación. */
export const ConSenaYPrecios: Story = {
  args: {
    methods: ['mercadopago'],
    initialPay: 'mercadopago',
    withDeposit: true,
    formato: null,
  },
  render: (args) => <Screen {...args} summary={{ ...summary, depositAmount: 450000 }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Seña a pagar ahora')).toBeVisible()
    await expect(canvas.getByText('La cancha es tuya cuando empezás a señar.')).toBeVisible()
    await expect(
      canvas.getByText(
        /Si cancelás con más de 12 horas de anticipación, el complejo te devuelve la seña/,
      ),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Pagar la seña' })).toBeEnabled()
  },
}

/** Con seña y precios ocultos, sin sesión, en el navegador interno de Instagram. */
export const ConSenaOcultaNavegadorInterno: Story = {
  args: {
    methods: ['mercadopago'],
    initialPay: 'mercadopago',
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
    // El resumen no dice cómo se paga; lo dice la sección de pago, con la frase del resto.
    await expect(
      canvas.getByText(
        'Para confirmar pagás una seña online con MercadoPago. El resto, en el complejo.',
      ),
    ).toBeVisible()
  },
}

/**
 * Con sesión, en un celular de 390 px: la barra fija de confirmar no tapa nada. `PortalFrame`
 * suma su alto (77 px) al de la barra inferior (57 px), así que al final del scroll el link más
 * bajo del pie queda por encima del borde superior de la barra. Sin esa regla el pie termina
 * 77 px más abajo y la barra lo cubre.
 */
export const BarraFijaNoTapaElPie: Story = {
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
    await expect(window.innerWidth).toBe(390)
    const bar = canvasElement.querySelector('[data-fixed-cta]')!
    await expect(getComputedStyle(bar).position).toBe('fixed')
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
    const barTop = bar.getBoundingClientRect().top
    const footerLinks = [...canvasElement.querySelectorAll('footer a')]
    await expect(footerLinks.length).toBeGreaterThan(0)
    const lowest = Math.max(...footerLinks.map((a) => a.getBoundingClientRect().bottom))
    await expect(lowest).toBeLessThanOrEqual(barTop)
  },
}

/**
 * WCAG 2.4.11 (foco no oculto): en un celular bajito, tabular al radio que quedó detrás de la barra
 * fija lo trae a la vista POR ENCIMA de ella. Sin el `scroll-padding-bottom` de `html` (globals.css)
 * el navegador lo da por visible —está dentro del viewport— y la barra lo tapa. Ese relleno es el
 * mismo alto que reserva `PortalFrame` (57 + 77 px); si uno cambia, el otro también.
 */
export const FocoNoQuedaTapadoPorLaBarra: Story = {
  globals: { viewport: { value: 'celularBajito', isRotated: false } },
  parameters: {
    viewport: {
      options: {
        celularBajito: { name: 'celular bajito', styles: { width: '390px', height: '520px' } },
      },
    },
  },
  render: (args) => <Screen {...args} summary={{ ...summary, hidePrices: true }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(window.innerWidth).toBe(390)
    await expect(window.innerHeight).toBe(520)
    const bar = canvasElement.querySelector('[data-fixed-cta]')!
    const frame = bar.closest('.player-shell-bg')!
    // El mismo alto en los dos lados: lo que reserva el marco y lo que reserva el scroll.
    await expect(getComputedStyle(frame).paddingBottom).toBe('134px')
    await expect(getComputedStyle(document.documentElement).scrollPaddingBottom).toBe('134px')

    const radio = canvas.getByRole('radio', { name: /efectivo/i })
    window.scrollTo({ top: 0, behavior: 'instant' })
    // Punto de partida: el radio está dentro del viewport pero detrás de la barra fija.
    const start = radio.getBoundingClientRect()
    await expect(start.top).toBeLessThan(window.innerHeight)
    await expect(start.bottom).toBeGreaterThan(bar.getBoundingClientRect().top)

    for (let i = 0; i < 15 && document.activeElement !== radio; i++) await userEvent.tab()
    await expect(document.activeElement).toBe(radio)
    await expect(radio.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      bar.getBoundingClientRect().top,
    )
  },
}

/**
 * Desde `md` el botón está en el flujo y no hay barra inferior: el marco no reserva nada. `:has()`
 * pesa más que `md:pb-0`, así que sin el `md:has-[...]:pb-0` quedaría el relleno del celular.
 */
export const BotonEnElFlujoDesdeMd: Story = {
  globals: { viewport: { value: 'tablet', isRotated: false } },
  render: (args) => <Screen {...args} summary={{ ...summary, hidePrices: true }} />,
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(768)
    const bar = canvasElement.querySelector('[data-fixed-cta]')!
    await expect(getComputedStyle(bar).position).toBe('static')
    const frame = bar.closest('.player-shell-bg')!
    await expect(getComputedStyle(frame).paddingBottom).toBe('0px')
    // Y el `scroll-padding` de `html` (para el foco) también vuelve a 0.
    await expect(getComputedStyle(document.documentElement).scrollPaddingBottom).toBe('0px')
  },
}

/**
 * La sesión del cliente todavía no se hidrató (llega con un fetch): la barra inferior va siempre,
 * así que ya está en el DOM, la barra fija está encima de ella y el marco ya reservó su alto.
 */
export const BarraFijaSinSesionHidratada: Story = {
  globals: { viewport: { value: 'celular390', isRotated: false } },
  parameters: {
    sesionHidratada: false,
    viewport: {
      options: {
        celular390: { name: 'celular 390', styles: { width: '390px', height: '844px' } },
      },
    },
  },
  render: (args) => <Screen {...args} summary={{ ...summary, hidePrices: true }} />,
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(390)
    // La barra inferior va siempre, también sin sesión hidratada…
    await expect(
      canvasElement.querySelector('nav[aria-label="Navegación del jugador"]'),
    ).not.toBeNull()
    const bar = canvasElement.querySelector('[data-fixed-cta]')!
    await expect(getComputedStyle(bar).position).toBe('fixed')
    // …y la barra fija está donde va: 57 px (3.5rem + 1 px) arriba del borde.
    await expect(window.innerHeight - bar.getBoundingClientRect().bottom).toBeCloseTo(57, 1)
    // Y el marco ya reservó barra inferior + barra fija: 57 + 77 px.
    const frame = bar.closest('.player-shell-bg')!
    await expect(getComputedStyle(frame).paddingBottom).toBe('134px')
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
    const footerLinks = [...canvasElement.querySelectorAll('footer a')]
    const lowest = Math.max(...footerLinks.map((a) => a.getBoundingClientRect().bottom))
    await expect(lowest).toBeLessThanOrEqual(bar.getBoundingClientRect().top)
  },
}
