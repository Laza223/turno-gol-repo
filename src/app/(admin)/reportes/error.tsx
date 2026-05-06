'use client'

export default function ReportesError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Reportes</h1>
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-700">
          Error al cargar el reporte. {error.message}
        </p>
        <button
          onClick={reset}
          className="mt-3 text-sm font-medium text-red-700 underline hover:no-underline"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
