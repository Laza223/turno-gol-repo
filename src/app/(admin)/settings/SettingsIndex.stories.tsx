import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import {
  Banknote,
  BellRing,
  Clock,
  CreditCard,
  Eye,
  Globe,
  HandCoins,
  LogOut,
  Mail,
  Receipt,
  Store,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { SettingsIndex, type SettingsIndexGroup } from './SettingsIndex'

/**
 * Portada de Ajustes con los valores de un complejo como El Vagón. Los montos
 * de la cuota son los de la fila de `plans` (migr. 090) para 5 canchas: la
 * página real los calcula con `buildPriceBreakdown`, acá van escritos porque
 * la story solo prueba la presentación.
 */
function groups({
  profileGaps = 0,
  problems = false,
}: { profileGaps?: number; problems?: boolean } = {}): SettingsIndexGroup[] {
  return [
    {
      title: 'Lo que ve el jugador',
      lead: 'En tu página y cuando reserva.',
      icon: Eye,
      items: [
        {
          label: 'Reservas por internet',
          effect: 'Si puede reservar solo y con cuánta anticipación.',
          value: 'Sí · 6 días',
          icon: Globe,
          tone: 'success',
          href: '/settings/reservas',
        },
        {
          label: 'Horarios',
          effect: 'A qué hora abrís cada día y los días que cerrás.',
          value: '08:00 a 01:00',
          icon: Clock,
          href: '/settings/horarios',
        },
        {
          label: 'Página pública',
          effect: 'Fotos, contacto y dónde queda.',
          value:
            profileGaps > 0
              ? profileGaps === 1
                ? 'Le falta 1 cosa'
                : `Le faltan ${profileGaps} cosas`
              : undefined,
          alert: profileGaps > 0,
          icon: Store,
          tone: 'warning',
          href: '/settings/perfil',
        },
      ],
    },
    {
      title: 'Cobrarle al jugador',
      lead: 'La seña de las reservas por internet.',
      icon: Banknote,
      items: [
        {
          label: 'Seña',
          effect: 'Cuánto paga al reservar y cuándo se le devuelve.',
          value: '30 %',
          icon: HandCoins,
          tone: 'success',
          href: '/settings/reservas#sena',
        },
        {
          label: 'MercadoPago para cobrar la seña',
          effect: 'Donde te entra esa plata.',
          value: problems ? 'Sin conectar' : 'Conectado',
          icon: Wallet,
          tone: problems ? 'warning' : 'success',
          href: '/settings/reservas#mercado-pago',
        },
      ],
    },
    {
      title: 'Lo que pagás a TurnoGol',
      lead: 'Tu cuota por cancha.',
      icon: Receipt,
      items: [
        {
          label: 'Cuota y pagos',
          effect: '$ 30.000 por cancha por mes.',
          value: problems ? 'Te diste de baja' : '$ 150.000 por mes',
          icon: Receipt,
          tone: problems ? 'destructive' : 'success',
          href: '/settings/facturacion',
        },
        {
          label: 'Cuenta de MercadoPago con la que pagás',
          effect: 'A qué cuenta te cobramos.',
          icon: CreditCard,
          href: '/settings/facturacion#cuenta-mp',
        },
        {
          label: 'Dar de baja TurnoGol',
          effect: 'Qué pasa y hasta cuándo seguís.',
          icon: LogOut,
          href: '/settings/facturacion#baja',
        },
      ],
    },
    {
      title: 'Vos y tu equipo',
      lead: 'Quién entra y qué le llega.',
      icon: UsersRound,
      items: [
        {
          label: 'Equipo',
          effect: 'Sumar un encargado o sacarlo.',
          value: '2 personas',
          icon: Users,
          href: '/settings/equipo',
        },
        {
          label: 'Email para entrar',
          effect: 'Con el que entrás a TurnoGol.',
          value: 'dueno@elvagon.com.ar',
          icon: Mail,
          plainValue: true,
          href: '/settings/equipo#tu-usuario',
        },
        {
          label: 'Resumen diario',
          effect: 'Lo que entró ayer, a las 8.',
          value: 'También por email',
          icon: BellRing,
          href: '/settings/equipo#tu-usuario',
        },
      ],
    },
  ]
}

const meta = {
  title: 'Admin/Settings/SettingsIndex',
  component: SettingsIndex,
  parameters: { layout: 'padded' },
  args: { groups: groups() },
} satisfies Meta<typeof SettingsIndex>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Cuatro grupos por consecuencia, cada uno con nombre accesible propio. Por
    // nombre y no contando regiones: el visor de toasts del decorator es otra.
    for (const name of [
      'Lo que ve el jugador',
      'Cobrarle al jugador',
      'Lo que pagás a TurnoGol',
      'Vos y tu equipo',
    ]) {
      await expect(canvas.getByRole('region', { name })).toBeVisible()
    }
    await expect(canvas.getByRole('link', { name: /Seña.*30 %/ })).toHaveAttribute(
      'href',
      '/settings/reservas#sena',
    )
  },
}

/** Sin MercadoPago, de baja y con la página incompleta: los tonos de alerta. */
export const Problemas: Story = {
  args: { groups: groups({ profileGaps: 2, problems: true }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('link', { name: /MercadoPago para cobrar.*Sin conectar/ }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: /Cuota y pagos.*Te diste de baja/ }),
    ).toBeVisible()
  },
}

/** A la página pública le falta algo: el renglón lo dice con el punto del riel. */
export const PaginaIncompleta: Story = {
  args: { groups: groups({ profileGaps: 2 }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('link', { name: /Página pública.*Le faltan 2 cosas/ }),
    ).toBeVisible()
  },
}
