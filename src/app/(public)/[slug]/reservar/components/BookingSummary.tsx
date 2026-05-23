import { CalendarDays, Clock, MapPin } from 'lucide-react'

function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(cents / 100)
}
function formatDateES(dateStr: string): string {
  const dt = new Date(dateStr + 'T12:00:00Z')
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(dt)
}

export type BookingSummaryData = {
  tenantName: string
  city: string
  courtName: string
  date: string
  timeStart: string
  timeEnd: string
  price: number
  depositAmount: number
}

export default function BookingSummary({ data }: { data: BookingSummaryData }) {
  const rest = Math.max(data.price - data.depositAmount, 0)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{data.tenantName}</h2>
        <p className="flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-3.5 w-3.5" aria-hidden /> {data.city}</p>
      </div>
      <dl className="space-y-2 border-t border-slate-100 pt-4 text-sm">
        <div className="flex items-center gap-2 text-slate-700"><CalendarDays className="h-4 w-4 text-emerald-600" aria-hidden /><span className="capitalize">{formatDateES(data.date)}</span></div>
        <div className="flex items-center gap-2 text-slate-700"><Clock className="h-4 w-4 text-emerald-600" aria-hidden /><span className="tabular-nums">{data.timeStart}–{data.timeEnd} · {data.courtName}</span></div>
      </dl>
      <div className="space-y-1 border-t border-slate-100 pt-4 text-sm">
        <div className="flex justify-between text-slate-600"><span>Precio del turno</span><span className="tabular-nums">{formatARS(data.price)}</span></div>
        {data.depositAmount > 0 ? (
          <>
            <div className="flex justify-between font-semibold text-slate-900"><span>Seña a pagar ahora</span><span className="tabular-nums">{formatARS(data.depositAmount)}</span></div>
            <div className="flex justify-between text-xs text-slate-500"><span>Resto en el complejo</span><span className="tabular-nums">{formatARS(rest)}</span></div>
          </>
        ) : (
          <p className="text-xs text-slate-500">Este complejo no requiere seña. Pagás el total en el complejo.</p>
        )}
      </div>
    </div>
  )
}
