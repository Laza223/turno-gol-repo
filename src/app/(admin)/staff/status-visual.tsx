import { CheckCircle2, ShieldCheck, Users, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAFF_ROLE_LABELS, type StaffRole } from '@/modules/staff/roles'

export type StaffBadgeVisual = {
  icon: LucideIcon
  label: string
  badge: string
}

// Rol es jerarquía de acceso, no un estado de §2.6: admin usa el único acento
// emerald del listado (§2.3 "pocos susurran") porque resalta el rol con acceso
// total; encargado (rol por defecto al invitar, roles.ts DEFAULT_INVITE_ROLE)
// queda en el tono neutro.
const ROLE_VISUALS: Record<StaffRole, StaffBadgeVisual> = {
  admin: {
    icon: ShieldCheck,
    label: STAFF_ROLE_LABELS.admin,
    badge:
      'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/25 dark:ring-emerald-500/40',
  },
  manager: {
    icon: Users,
    label: STAFF_ROLE_LABELS.manager,
    badge: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
  },
}

const STATUS_VISUALS: Record<'active' | 'inactive', StaffBadgeVisual> = {
  active: {
    icon: CheckCircle2,
    label: 'Activo',
    badge:
      'bg-success/10 text-emerald-800 ring-1 ring-inset ring-success/25 dark:bg-success/15 dark:text-emerald-300 dark:ring-success/40',
  },
  inactive: {
    icon: XCircle,
    label: 'Inactivo',
    badge: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
  },
}

function Badge({ visual, className }: { visual: StaffBadgeVisual; className?: string }) {
  const Icon = visual.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        visual.badge,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {visual.label}
    </span>
  )
}

/** Badge de rol (§6.5): ícono + texto, admin como único acento emerald del listado. */
export function StaffRoleBadge({ role, className }: { role: StaffRole; className?: string }) {
  return <Badge visual={ROLE_VISUALS[role]} className={className} />
}

/** Badge de estado de cuenta (§6.5), mismo patrón success/muted que abonados/canchas. */
export function StaffStatusBadge({ isActive, className }: { isActive: boolean; className?: string }) {
  return <Badge visual={STATUS_VISUALS[isActive ? 'active' : 'inactive']} className={className} />
}
