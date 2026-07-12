import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, screen, userEvent, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import QuickFilters from './QuickFilters'

const meta = {
  title: 'Player/Explorar/QuickFilters',
  component: QuickFilters,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } },
  },
} satisfies Meta<typeof QuickFilters>

export default meta
type Story = StoryObj<typeof meta>

/** Sin filtros activos: todos los chips inactivos. */
export const ChipsInactivos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Fútbol 5' })).toHaveAttribute('aria-pressed', 'false')
    await expect(canvas.getByRole('button', { name: /todos los filtros/i })).not.toHaveTextContent(/\d/)
  },
}

/** Formato/techado/online activos desde la URL + badge de contador en "Todos los filtros". */
export const ChipsActivosConBadge: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: '/explorar',
        query: { formats: '5', amenities: 'techado', online: '1' },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Fútbol 5' })).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByRole('button', { name: /techado/i })).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByRole('button', { name: /online/i })).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByText('3')).toBeInTheDocument()
  },
}

/** Click en un chip navega toggleando ese filtro en la URL. */
export const ToggleChip: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Fútbol 7' }))
    await expect(getRouter().push).toHaveBeenCalledWith(expect.stringContaining('formats=7'))
  },
}

/** "Todos los filtros" abre el drawer (bottom-sheet) con el panel completo de ExplorarFilters. */
export const DrawerAbierto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /todos los filtros/i }))
    // El drawer (Radix Dialog) se porta a document.body: se busca con `screen`.
    await expect(await screen.findByRole('heading', { name: 'Todos los filtros' })).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: 'Aplicar filtros' })).toBeInTheDocument()
  },
}
