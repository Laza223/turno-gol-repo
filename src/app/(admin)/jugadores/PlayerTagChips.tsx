import { PLAYER_TAG_LABELS, type PlayerTag } from '@/modules/relationships/player-tags'
import { cn } from '@/lib/utils'
import { TONE_BADGE, type StatusTone } from '@/lib/status-tone'

/**
 * Las 3 que cambian una decisión de mostrador se pintan; el resto queda neutro.
 * `no_credit` y `difficult` en ámbar (la misma familia visual que el indicador
 * de ausencias, que es el otro "ojo con este"); `gets_credit` en emerald.
 *
 * Los colores salen de `TONE_BADGE`, que es donde vive esa familia. Antes eran
 * recetas propias y las dos neutras usaban `bg-muted text-muted-foreground`
 * (4.21:1, falla AA — `status-tone.ts:5-10`).
 */
const TAG_TONE: Record<PlayerTag, StatusTone> = {
  no_credit: 'warning',
  difficult: 'warning',
  gets_credit: 'success',
  group_organizer: 'neutral',
  agreed_price: 'neutral',
}

type Props = {
  tags: PlayerTag[]
  className?: string
}

/** Etiquetas de cliente en modo lectura (B12 / D3). Sin UI de edición: eso vive en la ficha. */
export function PlayerTagChips({ tags, className }: Props) {
  if (tags.length === 0) return null
  return (
    <ul className={cn('flex flex-wrap gap-1', className)}>
      {tags.map((tag) => (
        <li
          key={tag}
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
            TONE_BADGE[TAG_TONE[tag]],
          )}
        >
          {PLAYER_TAG_LABELS[tag]}
        </li>
      ))}
    </ul>
  )
}
