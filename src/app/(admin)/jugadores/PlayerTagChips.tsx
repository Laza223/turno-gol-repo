import { PLAYER_TAG_LABELS, type PlayerTag } from '@/modules/relationships/player-tags'

/**
 * Las 3 que cambian una decisión de mostrador se pintan; el resto queda neutro.
 * `no_credit` y `difficult` en ámbar (la misma familia visual que el indicador
 * de ausencias, que es el otro "ojo con este"); `gets_credit` en emerald.
 */
const TAG_TONE: Record<PlayerTag, string> = {
  no_credit:
    'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400',
  difficult:
    'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400',
  gets_credit:
    'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400',
  group_organizer: 'border-border bg-muted text-muted-foreground',
  agreed_price: 'border-border bg-muted text-muted-foreground',
}

type Props = {
  tags: PlayerTag[]
  className?: string
}

/** Etiquetas de cliente en modo lectura (B12 / D3). Sin UI de edición: eso vive en la ficha. */
export function PlayerTagChips({ tags, className }: Props) {
  if (tags.length === 0) return null
  return (
    <ul className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {tags.map((tag) => (
        <li
          key={tag}
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TAG_TONE[tag]}`}
        >
          {PLAYER_TAG_LABELS[tag]}
        </li>
      ))}
    </ul>
  )
}
