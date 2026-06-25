import ReservaDarkShell from '@/components/booking/ReservaDarkShell'

export default function ReservaExitoLoading() {
  return (
    <ReservaDarkShell>
      <div
        className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12"
        role="status"
        aria-label="Cargando…"
      >
        <div className="mb-6 h-20 w-20 animate-pulse rounded-full bg-white/[.06]" aria-hidden />
        <div className="h-8 w-56 animate-pulse rounded-md bg-white/[.06]" aria-hidden />
        <div className="mt-3 h-4 w-48 animate-pulse rounded-md bg-white/[.05]" aria-hidden />
        <div className="mt-7 h-56 w-full animate-pulse rounded-2xl bg-white/[.05]" aria-hidden />
      </div>
    </ReservaDarkShell>
  )
}
