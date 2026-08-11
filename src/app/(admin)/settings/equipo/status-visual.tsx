import { CheckCircle2, ShieldCheck, Users, XCircle } from 'lucide-react'
import { StatusBadge, type StatusBadgeVisual } from '@/components/ui/status-badge'
import { STAFF_ROLE_LABELS, type StaffRole } from '@/modules/staff/roles'

type StaffBadgeVisual = StatusBadgeVisual

// Rol es jerarquía de acceso, no un estado de §2.6: admin usa el único acento
// emerald del listado (§2.3 "pocos susurran") porque resalta el rol con acceso
// total; encargado (rol por defecto al invitar, roles.ts DEFAULT_INVITE_ROLE)
// queda en el tono neutro.
const ROLE_VISUALS: Record<StaffRole, StaffBadgeVisual> = {
  admin: { icon: ShieldCheck, label: STAFF_ROLE_LABELS.admin, tone: 'brand' },
  manager: { icon: Users, label: STAFF_ROLE_LABELS.manager, tone: 'neutral' },
}

const STATUS_VISUALS: Record<'active' | 'inactive', StaffBadgeVisual> = {
  active: { icon: CheckCircle2, label: 'Activo', tone: 'success' },
  inactive: { icon: XCircle, label: 'Inactivo', tone: 'neutral' },
}

/** Badge de rol (§6.5): ícono + texto, admin como único acento emerald del listado. */
export function StaffRoleBadge({ role, className }: { role: StaffRole; className?: string }) {
  return <StatusBadge visual={ROLE_VISUALS[role]} className={className} />
}

/** Badge de estado de cuenta (§6.5), mismo patrón success/muted que abonados/canchas. */
export function StaffStatusBadge({
  isActive,
  className,
}: {
  isActive: boolean
  className?: string
}) {
  return (
    <StatusBadge visual={STATUS_VISUALS[isActive ? 'active' : 'inactive']} className={className} />
  )
}
