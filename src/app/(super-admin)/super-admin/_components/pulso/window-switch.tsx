import Link from 'next/link'
import { cn } from '@/lib/utils'
// Solo el tipo: el módulo del servicio arrastra la DB y no entra en el bundle de las stories.
import type { ActivityWindow } from '@/modules/super-admin/activity.service'

const LABELS: Record<ActivityWindow, string> = { hoy: 'Hoy', '7d': '7 días', '30d': '30 días' }
const WINDOWS = Object.keys(LABELS) as ActivityWindow[]

/**
 * Selector de ventana del Pulso: tres links (la ventana vive en la URL, no en
 * estado de cliente), así se puede compartir y funciona sin JavaScript.
 */
export function WindowSwitch({ current }: { current: ActivityWindow }) {
  return (
    <nav
      aria-label="Período del Pulso"
      className="inline-flex rounded-lg border border-border bg-card p-0.5"
    >
      {WINDOWS.map((w) => {
        const active = w === current
        return (
          <Link
            key={w}
            href={w === 'hoy' ? '/super-admin' : `/super-admin?ventana=${w}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-11 items-center rounded-md px-4 text-sm font-medium transition-colors md:h-9',
              active
                ? 'bg-primary/10 text-emerald-800 dark:text-emerald-300'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {LABELS[w]}
          </Link>
        )
      })}
    </nav>
  )
}
