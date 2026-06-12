import BookingQR from './BookingQR'

export type BookingReceiptData = {
  bookingId: string
  tenantName: string
  address: string
  city: string
  courtName: string
  /** "YYYY-MM-DD" */
  date: string
  /** "HH:MM:SS" o "HH:MM" */
  timeStart: string
  timeEnd: string
  /** Centavos ARS. */
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
  /** URL pública que codifica el QR. */
  verifyUrl: string
}

function fmtArs(cents: number): string {
  return (Math.round(cents) / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-200 py-2">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-semibold text-slate-900 tabular-nums">{value}</dd>
    </div>
  )
}

/**
 * Comprobante imprimible de la reserva. Vive oculto en la página de éxito
 * (#booking-receipt, ver globals.css): al imprimir es lo único visible y el
 * navegador lo exporta a PDF. Solo bordes y texto oscuro — los fondos no se
 * imprimen por defecto (print-color-adjust); el QR es SVG con fill, que sí.
 */
export default function BookingReceipt(props: BookingReceiptData) {
  const remaining = props.priceSnapshot - props.depositAmount
  const withDeposit = props.depositStatus !== 'not_required'

  return (
    <div id="booking-receipt" aria-hidden className="bg-white p-2 text-left">
      <header className="flex items-baseline justify-between border-b-2 border-slate-900 pb-3">
        <span className="text-xl font-extrabold tracking-tight text-slate-900">TurnoGol</span>
        <span className="text-sm font-medium text-slate-600">Comprobante de reserva</span>
      </header>

      <dl className="mt-4">
        <Row label="Complejo" value={props.tenantName} />
        <Row label="Dirección" value={`${props.address}, ${props.city}`} />
        <Row label="Cancha" value={props.courtName} />
        <Row label="Fecha" value={props.date.split('-').reverse().join('/')} />
        <Row label="Horario" value={`${props.timeStart.slice(0, 5)}–${props.timeEnd.slice(0, 5)}`} />
        <Row label="Precio del turno" value={`$${fmtArs(props.priceSnapshot)}`} />
        {withDeposit ? (
          <>
            <Row label="Seña pagada" value={`$${fmtArs(props.depositAmount)}`} />
            <Row label="Resta abonar en el complejo" value={`$${fmtArs(remaining)}`} />
          </>
        ) : (
          <Row label="Pago" value="El total se abona en el complejo" />
        )}
        <Row label="Código de reserva" value={props.bookingId.slice(0, 8).toUpperCase()} />
      </dl>

      <div className="mt-5 flex items-center gap-4">
        <BookingQR value={props.verifyUrl} label="Código QR de verificación de la reserva" size={132} />
        <p className="text-xs leading-5 text-slate-500">
          Escaneá este código para verificar el estado de la reserva en tiempo real, o entrá a:
          <br />
          <span className="break-all text-slate-700">{props.verifyUrl}</span>
        </p>
      </div>

      <footer className="mt-5 border-t border-slate-200 pt-2 text-[10px] text-slate-400">
        Reserva {props.bookingId} · Emitido por TurnoGol — este comprobante no es una factura.
      </footer>
    </div>
  )
}
