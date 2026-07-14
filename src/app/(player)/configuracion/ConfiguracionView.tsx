import Link from 'next/link'
import { ChevronRight, Download, Palette, Trash2, User } from 'lucide-react'
import PlayerHeroBand from '@/components/site/PlayerHeroBand'
import { DataExportButton } from './DataExportButton'
import ThemeToggle from '@/components/theme/ThemeToggle'

/**
 * Vista presentacional de /configuracion: banda hero + las 4 cards (Mi
 * perfil / Apariencia / Tus datos / Eliminar cuenta). Extraída de page.tsx
 * (que solo aporta auth + el fetch de `firstName`) para poder aislarla en
 * Storybook.
 */
export function ConfiguracionView({ firstName }: { firstName: string | null }) {
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <PlayerHeroBand
        eyebrow="Ajustes"
        title="Mi"
        accent="cuenta"
        subtitle={`${firstName ? `Hola ${firstName}, gestioná` : 'Gestioná'} tu perfil y tus datos.`}
      />

      {/* Card 0: Mi perfil */}
      <Link
        href="/perfil"
        className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/10 active:scale-[0.99] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
            <User className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-base font-bold tracking-tight text-foreground">Mi perfil</h2>
            <p className="text-sm text-muted-foreground">Editá tu nombre, teléfono y zona preferida.</p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" aria-hidden />
      </Link>

      {/* Card Apariencia */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
            <Palette className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="font-display text-base font-bold tracking-tight text-foreground">
            Apariencia
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Elegí el tema de la aplicación: seguí la preferencia de tu dispositivo, o forzá claro u oscuro.
        </p>
        <ThemeToggle />
      </div>

      {/* Card 1: Tus datos */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300">
            <Download className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="font-display text-base font-bold tracking-tight text-foreground">
            Tus datos personales
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Descargá una copia de todos tus datos guardados en TurnoGol (perfil, reservas, pagos,
          complejos con los que jugaste). Tu derecho de acceso según la Ley 25.326 (ARCO).
        </p>
        <DataExportButton />
      </div>

      {/* Card 2: Eliminar cuenta */}
      <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-400/20 dark:bg-red-500/10">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 ring-1 ring-inset ring-red-600/15 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20">
            <Trash2 className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="font-display text-base font-bold tracking-tight text-red-900 dark:text-red-300">
            Eliminar mi cuenta
          </h2>
        </div>
        <p className="text-sm text-red-800 dark:text-red-200">
          Eliminá permanentemente tu cuenta. Tu perfil se anonimiza, pero el historial financiero
          de los complejos se conserva por requisitos legales. Acción irreversible.
        </p>
        <Link
          href="/eliminar-cuenta"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-red-300 bg-card px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 active:scale-[0.98] dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
        >
          Iniciar eliminación
        </Link>
      </div>
    </div>
  )
}
