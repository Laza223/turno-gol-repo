import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silueta real del wizard (MASTER §5.3 "Espera"): rail de marca a la izquierda en
 * desktop, header con progreso en mobile, card de contenido con campos.
 *
 * No existía ningún `loading.tsx` en `/onboarding`: cada avance de paso era un
 * salto mudo sin Suspense boundary de segmento.
 */
export default function OnboardingLoading() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[380px_1fr]" aria-busy="true">
      {/* Rail: el fondo es real (no skeleton) — la marca no "carga". */}
      <aside className="hidden bg-linear-to-br from-slate-950 via-slate-900 to-emerald-950 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <Skeleton className="h-8 w-32 bg-white/10" label="Cargando el asistente…" />
        <div className="space-y-5">
          <Skeleton className="h-3 w-28 bg-white/10" aria-hidden />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-7 w-7 shrink-0 rounded-full bg-white/10" aria-hidden />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24 bg-white/10" aria-hidden />
                <Skeleton className="h-3 w-32 bg-white/5" aria-hidden />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-8 w-full bg-white/5" aria-hidden />
      </aside>

      <main className="bg-background">
        {/* Header mobile: logo + progreso + barra segmentada */}
        <header className="border-b border-border px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-28" aria-hidden />
            <Skeleton className="h-3 w-24" aria-hidden />
          </div>
          <div className="mt-2.5 flex gap-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-1 flex-1 rounded-full" aria-hidden />
            ))}
          </div>
        </header>

        <div className="flex justify-center px-4 py-8 md:py-12">
          <div className="w-full max-w-lg space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" aria-hidden />
              <Skeleton className="h-4 w-72" aria-hidden />
            </div>
            <div className="space-y-4 rounded-2xl border border-border bg-card p-6 md:p-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-4 w-32" aria-hidden />
                  <Skeleton className="h-11 w-full rounded-lg" aria-hidden />
                </div>
              ))}
              <Skeleton className="h-11 w-full rounded-lg" aria-hidden />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
