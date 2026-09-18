import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { within, expect } from 'storybook/test'
import {
  tenantActivity,
  tenantActivityEmpty,
  tenantActivityPage2,
} from '@/test/fixtures/super-admin'
import { ActividadTab } from './actividad-tab'

/**
 * Tab "Actividad": audit trail paginado (GET, sin JS) + últimas 10 reservas.
 * `activity` es un fixture estructuralmente compatible con `TenantActivity`
 * real (ver el comentario en resumen-tab.stories.tsx sobre por qué no se
 * importa el tipo directamente).
 */
const meta = {
  title: 'SuperAdmin/TenantDetail/ActividadTab',
  component: ActividadTab,
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/super-admin/tenants/1', query: { tab: 'actividad' } },
    },
  },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    activity: tenantActivity(),
  },
} satisfies Meta<typeof ActividadTab>

export default meta
type Story = StoryObj<typeof meta>

export const ConActividad: Story = {}

export const SinActividad: Story = {
  args: { activity: tenantActivityEmpty() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin eventos de auditoría.')).toBeInTheDocument()
    await expect(canvas.getByText('Sin reservas.')).toBeInTheDocument()
  },
}

/**
 * `?actPage=99` con eventos: la tarjeta no puede decir "Audit trail (N)" y
 * "Sin eventos" a la vez. Dice que la página no existe y no dibuja paginador.
 */
export const PaginaFueraDeRango: Story = {
  args: {
    activity: { ...tenantActivity(), logs: [], page: 99, totalLogs: 30, pageSize: 25 },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Esa página no existe/)).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Volver al principio' })).toHaveAttribute(
      'href',
      expect.stringContaining('actPage=1'),
    )
    await expect(
      canvas.queryByRole('navigation', { name: 'Paginación del audit trail' }),
    ).toBeNull()
  },
}

/** Página 2 de 2: el link "Anteriores" es un <a> real (paginación GET), "Siguientes" queda deshabilitado. */
export const SegundaPagina: Story = {
  args: { activity: tenantActivityPage2() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Anteriores' })).toHaveAttribute(
      'href',
      expect.stringContaining('actPage=1'),
    )
    await expect(canvas.getByText('Siguientes')).not.toHaveAttribute('href')
  },
}
