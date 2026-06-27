import { Skeleton } from 'turnogol'

export function TarjetaCargando() {
  return (
    <div className="w-80 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" aria-hidden />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" aria-hidden />
          <Skeleton className="h-3 w-1/3" aria-hidden />
        </div>
      </div>
      <Skeleton className="mt-4 h-24 w-full" aria-hidden />
    </div>
  )
}
