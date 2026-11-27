import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { catalogPricing, COURT_COUNT_PRICE_SLUG } from '@/modules/billing/pricing'
import BusinessLayout from '../layout'
import { PreciosView } from './PreciosView'
import { UNIFORM_PRICING } from './plans-data'

/**
 * La vista recibe el catálogo resuelto por la página. Monta el layout real
 * sin abrir una conexión a Postgres en el navegador de Storybook.
 */
const meta = {
  title: 'Public/Precios',
  component: PreciosView,
  args: {
    pricing: catalogPricing({
      slug: COURT_COUNT_PRICE_SLUG,
      priceFirstCourtCents: null,
      priceExtraCourtCents: null,
      annualDiscountBps: null,
    }),
  },
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  decorators: [
    (Story) => (
      <BusinessLayout>
        <Story />
      </BusinessLayout>
    ),
  ],
} satisfies Meta<typeof PreciosView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(
      /un precio para tu complejo/i,
    )
    const courts = canvas.getByRole('group', { name: /cuántos partidos/i })
    courts.scrollIntoView()
    await userEvent.click(within(courts).getByRole('button', { name: /^5$/ }))
    await expect(canvas.getByText(/110\.000 por mes/)).toBeInTheDocument()
    await userEvent.click(canvas.getByText(/Anual.*20%/))
    await expect(canvas.getByText(/1\.056\.000 por año/)).toBeInTheDocument()
    await userEvent.click(within(courts).getByRole('button', { name: /^8\+$/ }))
    await expect(canvas.getByRole('link', { name: 'Pedir cotización' })).toBeInTheDocument()
  },
}

export const AntesDeActivarElCatalogo: Story = {
  args: { pricing: UNIFORM_PRICING },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Completo' })).toBeInTheDocument()
    await expect(canvas.getByRole('heading', { name: 'Completo + WhatsApp' })).toBeInTheDocument()
  },
}

/** El accordion de FAQ usa `<details>/<summary>` nativo: abrir uno no cierra los demás. */
export const FaqAbierta: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const question = canvas.getByText('¿Mis clientes tienen que bajarse una app?')
    // El FAQ vive debajo del fold: `Reveal` (IntersectionObserver) solo
    // saca el bloque de `opacity-0` cuando entra en viewport, igual que un
    // visitante real que scrollea. Sin este scroll el wrapper de Reveal
    // nunca revela y `toBeVisible()` da falso positivo/negativo por esa
    // opacity heredada, no por el estado real del `<details>`.
    question.scrollIntoView()
    await waitFor(() => expect(question).toBeVisible())
    await expect(canvas.queryByText(/reservan desde un link/i)).not.toBeVisible()
    await userEvent.click(question)
    // La respuesta entra con un fundido corto (`pr-qa-in`): esperamos a que
    // termine para no leer opacity a mitad de la animación.
    await waitFor(() => expect(canvas.getByText(/reservan desde un link/i)).toBeVisible())
  },
}
