import { Archivo } from 'next/font/google'

/**
 * Archivo de la landing de RIVAL: la misma familia que el resto del sitio, con la itálica real y el
 * eje de ancho (`wdth`) para la tapa y los dorsales. Pisa `--font-archivo` solo adentro de la
 * landing, así el resto del sitio no carga estos archivos ni cambia su itálica.
 */
export const archivoRival = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  style: ['normal', 'italic'],
  variable: '--font-archivo',
  display: 'swap',
})
