import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { SetupAlertDot } from '@/components/layout/setup-alert-dot'
import { TONE_BADGE, type StatusTone } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

type SettingsIndexItem = {
  label: string
  /** Qué hay adentro, en palabras del dueño. Una línea. */
  effect: string
  /** El valor de hoy, corto ("Sí · 6 días", "30 %", "Conectado"). */
  value?: string
  /** Cómo se pinta el valor: verde lo que anda, ámbar lo que falta, rojo la baja. */
  tone?: StatusTone
  /** Valor largo (un email): texto plano truncado, sin pastilla. */
  plainValue?: boolean
  /** Hay algo por completar: punto rojo, mismo aviso que el del riel. */
  alert?: boolean
  icon: LucideIcon
  href: string
}

export type SettingsIndexGroup = {
  title: string
  lead: string
  icon: LucideIcon
  items: SettingsIndexItem[]
}

/**
 * Portada de Ajustes (2026-09-25). Agrupa por consecuencia y no por pantalla:
 * lo que ve el jugador, cobrarle al jugador, lo que pagás a TurnoGol, vos y tu
 * equipo. Fue la organización que mejor salió en la prueba "¿dónde lo
 * buscarías?" (docs/rediseno-panel/ajustes.md §4) y la única que en el
 * teléfono muestra todo sin deslizar una tira de pestañas.
 *
 * Se escanea por ícono y por color: cada renglón lleva su ícono y el valor de
 * hoy en una pastilla de estado (mismos tonos que el resto del panel). La
 * frase de "qué hay adentro" queda como apoyo, solo desde `sm`.
 *
 * Solo presentación: la página arma los grupos con los valores reales.
 */
export function SettingsIndex({ groups }: { groups: SettingsIndexGroup[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      {groups.map((group) => (
        <section
          key={group.title}
          aria-labelledby={groupId(group.title)}
          className="card-premium rounded-xl p-2"
        >
          <header className="flex items-center gap-2.5 px-4 pt-3 pb-2">
            <group.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <h2 id={groupId(group.title)} className="text-base font-semibold text-foreground">
              {group.title}
            </h2>
            <p className="sr-only">{group.lead}</p>
          </header>
          <ul>
            {group.items.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex min-h-14 items-center gap-3 rounded-lg px-4 py-2.5 transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-emerald-700 dark:text-emerald-400"
                  >
                    <item.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{item.label}</span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">
                      {item.effect}
                    </span>
                    {item.value && <ItemValue item={item} className="mt-1 flex sm:hidden" />}
                  </span>
                  {item.value && <ItemValue item={item} className="hidden sm:flex" />}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * El valor de hoy. Debajo del título en el teléfono (a la derecha le quita el
 * ancho al título y lo parte en tres renglones) y a la derecha desde `sm`.
 * Un solo DOM visible por vez: el otro queda en `display: none`.
 */
function ItemValue({ item, className }: { item: SettingsIndexItem; className: string }) {
  return (
    <span className={cn('max-w-full shrink-0 items-center gap-2 sm:max-w-[45%]', className)}>
      {item.alert && <SetupAlertDot />}
      {item.plainValue ? (
        <span className="truncate text-sm text-muted-foreground">{item.value}</span>
      ) : (
        <span
          className={cn(
            'inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums',
            TONE_BADGE[item.tone ?? 'neutral'],
          )}
        >
          <span className="truncate">{item.value}</span>
        </span>
      )}
    </span>
  )
}

function groupId(title: string): string {
  return `ajustes-${title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')}`
}
