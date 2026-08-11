import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SectionCard } from './SectionCard'

/**
 * Tarjeta contenedora de cada acción de soporte (título + descripción + cuerpo).
 * Homónimo de otro `SectionCard` definido inline en `super-admin/page.tsx` —
 * son dos componentes distintos, este es el del panel de Acciones del tenant.
 */
const meta = {
  title: 'SuperAdmin/TenantDetail/AccionesSoporte/SectionCard',
  component: SectionCard,
  parameters: { layout: 'padded' },
  args: {
    title: 'Extender trial',
    description: 'Mueve el fin de trial a max(hoy, fin actual) + días. Solo para tenants en trial.',
    children: <p className="text-sm text-muted-foreground">Contenido de la sección.</p>,
  },
} satisfies Meta<typeof SectionCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Con un formulario real adentro, para ver el espaciado título/descripción/cuerpo. */
export const ConFormulario: Story = {
  args: {
    title: 'Resetear contraseña de staff',
    description:
      'Genera una contraseña temporal para un miembro del complejo (soporte telefónico).',
    children: (
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="email"
          placeholder="staff@complejo.com"
          className="h-10 w-64 rounded-md border border-border px-3 text-sm"
        />
        <button
          type="button"
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white"
        >
          Resetear contraseña
        </button>
      </div>
    ),
  },
}
