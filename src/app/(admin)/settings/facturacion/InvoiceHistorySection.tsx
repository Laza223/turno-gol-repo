import { AlertCircle, CheckCircle2, Clock, Receipt, RefreshCw, Undo2, XCircle } from 'lucide-react'
import { formatArs } from '@/lib/format'
import { StatusBadge, type StatusBadgeVisual } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { InvoiceEntry } from '@/modules/billing/billing.types'

type Props = {
  invoices: InvoiceEntry[]
}

// Exportado: el resumen del disclosure "Pagos del plan" (page.tsx) reusa la
// misma etiqueta para el último cobro en vez de duplicar el mapeo.
export const STATUS_LABELS: Record<InvoiceEntry['status'], string> = {
  pending: 'Pendiente',
  in_process: 'En proceso',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  refunded: 'Reembolsado',
  cancelled: 'Cancelado',
}

/**
 * El estado del cobro va al `StatusBadge` del sistema, no a una pastilla
 * propia: es plata, y tiene que leerse (color + ícono + texto, DESIGN.md
 * Chips/StatusBadge) igual que el resto del producto. `refunded` y
 * `cancelled` usaban `bg-muted text-muted-foreground`, que da 4.21:1 y falla
 * AA (`status-tone.ts:5-10`). Íconos con el significado del resto del panel:
 * `XCircle` = cancelado, `AlertCircle` = problema de pago (`past_due`), `Ban`
 * queda para bloqueado.
 */
const STATUS_VISUALS: Record<InvoiceEntry['status'], StatusBadgeVisual> = {
  approved: { icon: CheckCircle2, label: STATUS_LABELS.approved, tone: 'success' },
  pending: { icon: Clock, label: STATUS_LABELS.pending, tone: 'warning' },
  in_process: { icon: RefreshCw, label: STATUS_LABELS.in_process, tone: 'warning' },
  rejected: { icon: AlertCircle, label: STATUS_LABELS.rejected, tone: 'destructive' },
  refunded: { icon: Undo2, label: STATUS_LABELS.refunded, tone: 'neutral' },
  cancelled: { icon: XCircle, label: STATUS_LABELS.cancelled, tone: 'neutral' },
}

function formatDate(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * doc15 §5.8 (`GET /api/billing/invoices`): historial de cobros de la
 * suscripción SaaS. `invoices` viene de `listInvoices` — leído en vivo de
 * MercadoPago, no hay tabla local (ver el comentario de `InvoiceEntry`), así
 * que no incluye pagos de upgrade (proraeo): esos cuelgan de otra referencia.
 * Server Component puro (la page ya resuelve `invoices` server-side) — sin
 * `'use client'` porque no hay ninguna interacción, solo listar.
 */
export function InvoiceHistorySection({ invoices }: Props) {
  return (
    <section className="card-premium rounded-xl p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden /> Historial
        de pagos
      </h2>
      {/* Aclarado a pedido de la verificación adversarial (2026-08-27): sin
          esto, un cambio de plan pagado (upgrade con proraeo) no aparece acá
          — usa otra referencia de MercadoPago, ver InvoiceEntry — y se podía
          leer como un error del sistema en vez de una omisión a propósito. */}
      <p className="mt-1 text-xs text-muted-foreground">
        Cobros mensuales o anuales del plan. Los cambios de plan con pago adicional se ven en el
        movimiento de esa fecha, no acá.
      </p>

      {invoices.length === 0 ? (
        <EmptyState className="mt-4" icon={Receipt} title="Todavía no hay cobros registrados." />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th scope="col" className="pb-2 pr-4 font-medium">
                  Fecha
                </th>
                <th scope="col" className="pb-2 pr-4 font-medium">
                  Monto
                </th>
                <th scope="col" className="pb-2 font-medium">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.mpPaymentId} className="border-b border-border last:border-0">
                  <td className="py-2.5 pr-4 text-foreground">{formatDate(invoice.date)}</td>
                  <td className="py-2.5 pr-4 font-medium tabular-nums text-foreground">
                    {formatArs(invoice.amount)}
                  </td>
                  <td className="py-2.5">
                    <StatusBadge visual={STATUS_VISUALS[invoice.status]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
