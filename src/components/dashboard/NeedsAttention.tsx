import Link from 'next/link'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatArs } from '@/lib/format'
import type { AttentionItem } from '@/modules/home/home.types'

/** Copy exacto del contrato (verbatim, nunca parafraseado) — un componente
 * reusable no puede importar VALORES del dominio (solo tipos), así que este
 * literal se mantiene igual a `ATTENTION_EMPTY_COPY` en
 * `@/modules/home/home.lib` a mano; `home.lib.test.ts` es la fuente de
 * verdad que lo verifica contra el contrato. */
const ATTENTION_EMPTY_COPY = 'Nada pendiente. Todo cobrado y cerrado.'

function descriptionFor(item: AttentionItem): string {
  switch (item.kind) {
    case 'unpaid_completed_booking':
      return `${item.contactName} — ${item.courtName} ${item.timeLabel} — ${formatArs(item.pendingCents)} pendiente`
    case 'failed_deposit':
      return `Seña rechazada — ${item.contactName} — ${item.courtName}`
    case 'yesterday_cash_unclosed':
      return 'La caja de ayer sigue sin cerrar'
  }
}

function actionFor(item: AttentionItem): { label: string; href: string } {
  switch (item.kind) {
    case 'unpaid_completed_booking':
      return { label: `Cobrar ${formatArs(item.pendingCents)}`, href: `/reservas/${item.bookingId}` }
    case 'failed_deposit':
      return { label: 'Ver reserva', href: `/reservas/${item.bookingId}` }
    case 'yesterday_cash_unclosed':
      return { label: 'Cerrar caja de ayer', href: '/caja' }
  }
}

const ICON_BY_KIND = {
  unpaid_completed_booking: AlertTriangle,
  failed_deposit: XCircle,
  yesterday_cash_unclosed: AlertTriangle,
} as const

/**
 * "Necesita tu atención" (Fase 2, contrato §4.1 + taxonomía
 * docs/decisions/2026-08-02-taxonomia-alertas-hoy.md): SOLO las 3 anomalías
 * v1, cada una con su acción al lado. El vacío es el premio — copy exacto
 * del contrato, nunca parafraseado. El título de la sección queda visible
 * en los dos estados (vacío incluido): sin él, el vacío queda flotando sin
 * decir DE QUÉ está vacío.
 */
export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  return (
    <div className="card-premium rounded-2xl">
      <h2 className="border-b border-border px-4 py-3 text-base font-semibold text-foreground sm:px-5">
        Necesita tu atención
      </h2>
      {items.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={ATTENTION_EMPTY_COPY} className="rounded-t-none border-0 py-10" />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const Icon = ICON_BY_KIND[item.kind]
            const action = actionFor(item)
            const key = 'bookingId' in item ? item.bookingId : `${item.kind}-${item.date}`
            return (
              <li
                key={key}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <span className="min-w-0 truncate text-sm text-foreground">{descriptionFor(item)}</span>
                </div>
                <Link href={action.href} className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}>
                  {action.label}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
