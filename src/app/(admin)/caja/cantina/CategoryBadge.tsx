import { CATEGORY_BADGE, categoryLabel } from '../caja-lib'

export function CategoryBadge({ type, category }: { type: string; category: string }) {
  const badge = CATEGORY_BADGE[category as keyof typeof CATEGORY_BADGE] ?? CATEGORY_BADGE.fallback
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge}`}
    >
      {categoryLabel(type, category)}
    </span>
  )
}
