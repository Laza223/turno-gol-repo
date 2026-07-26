import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { tournament } from '@/test/fixtures'
import { PortalPanel } from './PortalPanel'
import type { TournamentActionResult } from '../actions'

const ok = () => fn(async (): Promise<TournamentActionResult> => ({ success: true }))

const meta = {
  title: 'Admin/Torneos/PortalPanel',
  component: PortalPanel,
  parameters: { layout: 'padded' },
  args: {
    tournamentId: tournament().id,
    slug: 'clausura-2026',
    tenantSlug: 'complejo-la-bombonerita',
    status: 'in_progress' as const,
    isPublic: false,
    canPublish: true,
    setVisibilityAction: ok(),
  },
} satisfies Meta<typeof PortalPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Sin publicar: no se ofrece el link porque no hay nada que abrir. */
export const SinPublicar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('El torneo no se ve desde afuera.')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Publicar' })).toBeEnabled()
    await expect(canvas.queryByRole('link')).toBeNull()
  },
}

/** Publicado: se muestra la URL exacta, para copiarla y mandarla. */
export const Publicado: Story = {
  args: { isPublic: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('link', { name: /complejo-la-bombonerita\/torneos\/clausura-2026/ }),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Despublicar' })).toBeVisible()
  },
}

/**
 * El caso que hay que avisar: marcado público pero todavía en borrador. El
 * portal no lo muestra y sin este texto el complejo creería que sí.
 */
export const PublicoPeroEnBorrador: Story = {
  args: { isPublic: true, status: 'draft' as const },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/sigue en borrador/)).toBeVisible()
    await expect(canvas.queryByRole('link')).toBeNull()
  },
}

/** El encargado ve el estado pero no lo cambia: publicar es del dueño. */
export const SinPermiso: Story = {
  args: { canPublish: false, isPublic: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Despublicar' })).toBeDisabled()
    await expect(canvas.getByText(/lo hace el dueño del complejo/)).toBeVisible()
  },
}
