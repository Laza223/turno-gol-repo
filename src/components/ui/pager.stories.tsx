import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Pager, pageRangeLabel } from './pager'

/**
 * Las props del paginador son una unión (link O botón) y Storybook no sabe
 * derivar `args` de una unión: cada story arma su `render` a mano.
 */
const meta = {
  title: 'Design System/Pager',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-2xl bg-background p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const onPageChange = fn()

/** Página en la URL: los controles son links de verdad, con `rel`. */
export const ConLinks: Story = {
  render: () => (
    <Pager
      label="Paginación de movimientos del día"
      page={1}
      hasMore
      hrefFor={(p) => `/caja/cuentas?mov=${p + 1}`}
    />
  ),
  play: async ({ canvasElement }) => {
    const nav = within(
      within(canvasElement).getByRole('navigation', { name: 'Paginación de movimientos del día' }),
    )
    await expect(nav.getByRole('link', { name: /Anteriores/ })).toHaveAttribute('rel', 'prev')
    await expect(nav.getByRole('link', { name: /Siguientes/ })).toHaveAttribute(
      'href',
      '/caja/cuentas?mov=3',
    )
    await expect(nav.getByText('Página 2')).toBeVisible()
  },
}

/** Filas ya en el cliente: botones, y el medio dice el tramo que se ve. */
export const ConBotones: Story = {
  render: () => (
    <Pager
      label="Paginación de deudas"
      page={0}
      hasMore
      summary={pageRangeLabel(0, 25, 47)}
      onPageChange={onPageChange}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('1–25 de 47')).toBeVisible()
    // En la primera página no hay "Anteriores".
    await expect(canvas.queryByRole('button', { name: /Anteriores/ })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: /Siguientes/ }))
    await expect(onPageChange).toHaveBeenCalledWith(1)
  },
}

/** Una sola página: no se dibuja nada. Un "Página 1" solitario es ruido. */
export const UnaSolaPagina: Story = {
  render: () => <Pager label="Paginación de deudas" page={0} hasMore={false} hrefFor={() => '/'} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('navigation')).toBeNull()
  },
}
