import { formatArsContable } from '@/lib/format'

export function SignedAmount({ type, amount }: { type: string; amount: number }) {
  const isExpense = type === 'expense'
  return (
    <span
      className={`font-medium tabular-nums ${
        isExpense ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
      }`}
    >
      {isExpense ? '−' : '+'}
      {formatArsContable(amount)}
    </span>
  )
}
