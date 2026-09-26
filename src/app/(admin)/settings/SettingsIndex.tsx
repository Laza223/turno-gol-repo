import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SetupAlertDot } from '@/components/layout/setup-alert-dot'

type SettingsIndexItem = {
  label: string
  /** Qué hay adentro, en palabras del dueño. Una línea. */
  effect: string
  /** El valor de hoy, corto ("Sí · 6 días", "30 %", "Conectado"). */
  value?: string
  /** Hay algo por completar: punto rojo, mismo aviso que el del riel. */
  alert?: boolean
  href: string
}

export type SettingsIndexGroup = {
  title: string
  lead: string
  items: SettingsIndexItem[]
}

/**
 * Portada de Ajustes (2026-09-25). Agrupa por consecuencia y no por pantalla:
 * lo que ve el jugador, cobrarle al jugador, lo que pagás a TurnoGol, vos y tu
 * equipo. Fue la organización que mejor salió en la prueba "¿dónde lo
 * buscarías?" (docs/rediseno-panel/ajustes.md §4) y la única que en el
 * teléfono muestra todo sin deslizar una tira de pestañas.
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
          <header className="px-4 pt-3 pb-1">
            <h2 id={groupId(group.title)} className="text-base font-semibold text-foreground">
              {group.title}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{group.lead}</p>
          </header>
          <ul>
            {group.items.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex min-h-14 items-center gap-3 rounded-lg px-4 py-2.5 transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{item.label}</span>
                    <span className="block text-sm text-muted-foreground">{item.effect}</span>
                  </span>
                  {item.value && (
                    <span className="flex max-w-[45%] shrink-0 items-center gap-2 text-sm tabular-nums text-muted-foreground">
                      {item.alert && <SetupAlertDot />}
                      <span className="truncate">{item.value}</span>
                    </span>
                  )}
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

function groupId(title: string): string {
  return `ajustes-${title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')}`
}
