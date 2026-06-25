import { CalendarDays, Clock, MapPin } from 'lucide-react'
import { capitalizeFirst } from '@/lib/format'

function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(cents / 100)
}
function formatDateES(dateStr: string): string {
  const dt = new Date(dateStr + 'T12:00:00Z')
  return capitalizeFirst(new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(dt))
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
    <div
      className="relative space-y-4 overflow-hidden rounded-2xl p-5"
      style={{
        background: 'linear-gradient(180deg, rgba(15,23,42,.72), rgba(2,6,23,.85))',
        border: '1px solid rgba(255,255,255,.1)',
        boxShadow: '0 0 60px rgba(16,185,129,.12), 0 40px 80px -42px rgba(0,0,0,.9)',
      }}
    >
      <div>
        <h2 className="font-display text-lg font-bold text-white">{data.tenantName}</h2>
        <p className="flex items-center gap-1.5 text-sm text-slate-400"><MapPin className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> {data.city}</p>
      </div>
      <dl className="space-y-2.5 border-t border-white/10 pt-4 text-sm">
        <div className="flex items-center gap-2 text-slate-300"><CalendarDays className="h-4 w-4 text-emerald-400" aria-hidden /><span>{formatDateES(data.date)}</span></div>
        <div className="flex items-center gap-2 text-slate-300"><Clock className="h-4 w-4 text-emerald-400" aria-hidden /><span className="tabular-nums">{data.timeStart}–{data.timeEnd} · {data.courtName}</span></div>
      </dl>
      <div className="space-y-1.5 border-t border-white/10 pt-4 text-sm">
        <div className="flex justify-between text-slate-400"><span>Precio del turno</span><span className="tabular-nums text-slate-200">{formatARS(data.price)}</span></div>
        {data.depositAmount > 0 ? (
          <>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="font-semibold text-white">Seña a pagar ahora</span>
              <span className="font-display text-xl font-bold tabular-nums text-emerald-400">{formatARS(data.depositAmount)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500"><span>Resto en el complejo</span><span className="tabular-nums">{formatARS(rest)}</span></div>
          </>
        ) : (
          <p className="text-xs text-slate-500">Este complejo no requiere seña. Pagás el total en el complejo.</p>
        )}
      </div>
    </div>
  )
}
