import { Receipt } from 'lucide-react'
import { formatArs } from '@/lib/format'
import type { InvoiceEntry } from '@/modules/billing/billing.types'

type Props = {
  invoices: InvoiceEntry[]
}

const STATUS_LABELS: Record<InvoiceEntry['status'], string> = {
  pending: 'Pendiente',
  in_process: 'En proceso',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  refunded: 'Reembolsado',
  cancelled: 'Cancelado',
}

const STATUS_STYLES: Record<InvoiceEntry['status'], string> = {
  approved:
    'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30',
  pending:
    'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30',
  in_process:
    'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30',
  rejected:
    'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/30',
  refunded: 'bg-muted text-muted-foreground ring-border',
  cancelled: 'bg-muted text-muted-foreground ring-border',
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
        <p className="mt-3 text-sm text-muted-foreground">Todavía no hay cobros registrados.</p>
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
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[invoice.status]}`}
                    >
                      {STATUS_LABELS[invoice.status]}
                    </span>
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
