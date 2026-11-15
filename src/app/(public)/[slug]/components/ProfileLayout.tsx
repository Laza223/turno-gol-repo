import type { ReactNode } from 'react'
import './ficha-rest.css'

/**
 * Esqueleto de la ficha del complejo, compartido por la página, su `loading.tsx` y la story de la
 * página entera. En el DOM va hero → reserva → resto (orden de lectura y de tab): la reserva sube
 * antes que las fotos y los horarios. Desde lg (1024 px) se acomoda en dos columnas: cabecera y
 * resto a la izquierda y la reserva como columna derecha de 480 px, fija debajo de la barra
 * (`top-24`, `.reserve` del mockup). La portada del hero (`.fr-bg`) se ancla a este contenedor, que
 * además trae la luz de fondo del portal; con portada, `pt-20` la deja ver arriba de la tarjeta (sin
 * portada no hay nada que mostrar ahí y la tarjeta sube).
 *
 * Las filas son tres (`auto auto 1fr`) para que, si la reserva es más alta que cabecera + resto,
 * el sobrante caiga en la fila vacía y no abra un hueco entre los dos.
 */
export default function ProfileLayout({
  hero,
  reserve,
  rest,
}: {
  hero: ReactNode
  reserve: ReactNode
  rest?: ReactNode
}) {
  return (
    <div className="portal-ambient relative">
      <div className="mx-auto grid w-full max-w-[1120px] gap-3.5 px-4 pt-4 pb-10 sm:px-6 has-[.fr-bg]:pt-20 md:pt-8 md:has-[.fr-bg]:pt-32 lg:grid-cols-[minmax(0,1fr)_480px] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-7 lg:gap-y-6">
        <div className="lg:col-start-1 lg:row-start-1">{hero}</div>
        <div className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-3 lg:row-start-1">
          {reserve}
        </div>
        {rest && (
          <div className="mt-4 grid gap-6 lg:col-start-1 lg:row-start-2 lg:mt-0">{rest}</div>
        )}
      </div>
    </div>
  )
}
