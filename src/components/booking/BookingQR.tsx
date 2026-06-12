import { encode } from 'uqr'

type Props = {
  /** Contenido del QR (URL de verificación de la reserva). */
  value: string
  /** Texto accesible del gráfico. */
  label: string
  /** Lado en px del SVG renderizado (el QR es vectorial, escala sin pérdida). */
  size?: number
}

/**
 * QR generado localmente con uqr (~3KB gzip, sin dependencias): nada de
 * servicios externos de QR. Componente universal sin estado — renderiza un
 * SVG puro, así funciona en Server Components (página de éxito, comprobante
 * imprimible) y en tests de unidad por igual.
 */
export default function BookingQR({ value, label, size = 176 }: Props) {
  // ECC 'M' (~15% de corrección): suficiente para una URL corta escaneada
  // desde una pantalla de teléfono. border=2 deja quiet zone estándar.
  const qr = encode(value, { ecc: 'M', border: 2 })

  let d = ''
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.data[y]?.[x]) d += `M${x} ${y}h1v1h-1z`
    }
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
    >
      <rect width={qr.size} height={qr.size} fill="#ffffff" />
      <path d={d} fill="#0f172a" />
    </svg>
  )
}
