import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Pager } from './pager'

/**
 * Las props del paginador son una unión (link O botón, total O `hasMore`) y
 * Storybook no sabe derivar `args` de una unión: cada story arma su `render`.
 */
const meta = {
  title: 'Design System/Pager',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-3xl bg-background p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const onPageChange = fn()

/**
 * Con el total: tramo visible, primera y última página siempre a mano, la
 * actual marcada y "…" en los huecos. Página en la URL: links de verdad.
 */
export const ConTotal: Story = {
  render: () => (
    <Pager
      label="Paginación de reservas"
      page={5}
      total={312}
      pageSize={25}
      hrefFor={(p) => `/reservas?dia=historial&pagina=${p + 1}`}
    />
  ),
  play: async ({ canvasElement }) => {
    const nav = within(
      within(canvasElement).getByRole('navigation', { name: 'Paginación de reservas' }),
    )
    await expect(nav.getByRole('status')).toHaveTextContent('126–150 de 312')
    await expect(nav.getByText('6')).toHaveAttribute('aria-current', 'page')
    await expect(nav.getByRole('link', { name: 'Página 1' })).toHaveAttribute(
      'href',
      '/reservas?dia=historial&pagina=1',
    )
    await expect(nav.getByRole('link', { name: 'Página 13' })).toBeVisible()
    await expect(nav.getByRole('link', { name: /Anteriores/ })).toHaveAttribute('rel', 'prev')
    await expect(nav.getByRole('link', { name: /Siguientes/ })).toHaveAttribute(
      'href',
      '/reservas?dia=historial&pagina=7',
    )
  },
}

/**
 * Filas ya en el cliente: botones. En la primera página "Anteriores" queda
 * apagado en su lugar (no es un botón), para que la barra no salte.
 */
export const PrimeraPaginaConBotones: Story = {
  render: () => (
    <Pager
      label="Paginación de deudas"
      page={0}
      total={47}
      pageSize={25}
      onPageChange={onPageChange}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent('1–25 de 47')
    await expect(canvas.queryByRole('button', { name: /Anteriores/ })).toBeNull()
    await expect(canvas.getByText('Anteriores').closest('[aria-disabled]')).not.toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Página 2' }))
    await expect(onPageChange).toHaveBeenCalledWith(1)
  },
}

/** Última página: "Siguientes" apagado y el tramo corta en el total. */
export const UltimaPagina: Story = {
  render: () => (
    <Pager
      label="Paginación de movimientos de stock"
      page={12}
      total={312}
      pageSize={25}
      hrefFor={(p) => `/caja/productos?stock=${p + 1}`}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent('301–312 de 312')
    await expect(canvas.queryByRole('link', { name: /Siguientes/ })).toBeNull()
    await expect(canvas.getByText('13')).toHaveAttribute('aria-current', 'page')
  },
}

/** Sin el total (`LIMIT n+1`): solo "Página N" y anterior/siguiente. */
export const SinTotal: Story = {
  render: () => (
    <Pager
      label="Paginación de personas"
      page={1}
      hasMore
      hrefFor={(p) => `/jugadores?pagina=${p + 1}`}
    />
  ),
  play: async ({ canvasElement }) => {
    const nav = within(within(canvasElement).getByRole('navigation'))
    await expect(nav.getByText('Página 2')).toBeVisible()
    await expect(nav.queryByRole('link', { name: /^Página/ })).toBeNull()
    await expect(nav.getByRole('link', { name: /Siguientes/ })).toHaveAttribute(
      'href',
      '/jugadores?pagina=3',
    )
  },
}

/**
 * Fuera de rango (`?pagina=99` con 47 filas): no se dibuja. "Anteriores"
 * llevaría a la 98, otra página vacía; la pantalla ofrece volver a la primera.
 */
export const FueraDeRango: Story = {
  render: () => (
    <Pager label="Paginación de deudas" page={98} total={47} pageSize={25} hrefFor={() => '/'} />
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('navigation')).toBeNull()
  },
}

/** Una sola página: no se dibuja nada. Un "Página 1" solitario es ruido. */
export const UnaSolaPagina: Story = {
  render: () => (
    <Pager label="Paginación de deudas" page={0} total={12} pageSize={25} hrefFor={() => '/'} />
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('navigation')).toBeNull()
  },
}
