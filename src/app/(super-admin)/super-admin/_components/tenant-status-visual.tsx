import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  PauseCircle,
  Trash2,
  TrendingDown,
  XCircle,
} from 'lucide-react'
import { StatusBadge, type StatusBadgeVisual } from '@/components/ui/status-badge'
import type { TenantStatus } from '@/modules/billing/billing.types'

/**
 * Estado del tenant → visual, fuente única del panel de super-admin.
 *
 * B1 (2026-08-09) — ANTES había DOS `TenantStatusBadge`, cada uno con su propia
 * tabla de clases hardcodeadas:
 *
 *   `_components/tenant-status-badge.tsx`        (dashboard, con `count`)
 *   `tenants/_components/status-badge.tsx`       (lista y detalle de tenants)
 *
 * Mismo set de 8 estados, mismas etiquetas, y ya habían divergido en color: en
 * uno `suspended` era ámbar y en el otro rojo; `churned` era gris en uno y rojo
 * en el otro. El mismo complejo se veía de dos colores distintos según la
 * pantalla del panel.
 *
 * Encima ninguno de los dos pasaba por `StatusBadge`, que existe justamente
 * para imponer la regla de MASTER §1.4: **color + ícono + texto siempre juntos,
 * nunca color solo** (daltonismo). Los dos distinguían los 8 estados únicamente
 * por color de fondo. Ahora los tonos salen de `TONE_BADGE` y cada estado lleva
 * su ícono.
 *
 * La escalera del lifecycle (doc4 §2) se lee en el tono: sano (success) →
 * atención (warning) → terminal (destructive) → inerte (neutral).
 */
const TENANT_STATUS_VISUALS: Record<TenantStatus, StatusBadgeVisual> = {
  trialing: { icon: Clock, label: 'Trial', tone: 'info' },
  active: { icon: CheckCircle2, label: 'Activo', tone: 'success' },
  past_due: { icon: AlertCircle, label: 'Pago vencido', tone: 'warning' },
  suspended: { icon: PauseCircle, label: 'Suspendido', tone: 'warning' },
  blocked: { icon: Ban, label: 'Bloqueado', tone: 'destructive' },
  canceled: { icon: XCircle, label: 'Cancelado', tone: 'neutral' },
  churned: { icon: TrendingDown, label: 'Churned', tone: 'destructive' },
  deleted: { icon: Trash2, label: 'Eliminado', tone: 'neutral' },
}

/**
 * Badge de estado del tenant (los 8 de `tenant_status`, doc4 §2).
 *
 * `count` lo usa el dashboard para el desglose por estado ("Activo 12"); las
 * vistas de lista y detalle lo omiten.
 */
export function TenantStatusBadge({
  status,
  count,
  className,
}: {
  status: TenantStatus
  count?: number
  className?: string
}) {
  const visual = TENANT_STATUS_VISUALS[status]
  if (count === undefined) return <StatusBadge visual={visual} className={className} />

  return (
    <StatusBadge visual={{ ...visual, label: `${visual.label} ${count}` }} className={className} />
  )
}
