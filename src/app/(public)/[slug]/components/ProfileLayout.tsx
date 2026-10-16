import type { ReactNode } from 'react'

/**
 * Esqueleto de la ficha del complejo, compartido por la página, su `loading.tsx` y la story de la
 * página entera. En el DOM va hero → reserva → resto (orden de lectura y de tab): la reserva sube
 * antes que las fotos y los horarios. Desde lg se acomoda en dos columnas, con la reserva como
 * columna lateral fija debajo de la barra (`top-14`) y scroll interno si no entra; su padding (4 px,
 * con margen superior negativo para no bajar la columna) deja lugar al anillo de foco, que ese
 * scroll recortaría, y alinea el primer chip con el borde superior del hero.
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
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:py-8">
      <div className="lg:col-start-1 lg:row-start-1">{hero}</div>
      <div className="-mx-1 mt-6 px-1 lg:sticky lg:top-14 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:-mt-1 lg:max-h-[calc(100dvh-3.5rem)] lg:self-start lg:overflow-y-auto lg:py-1">
        {reserve}
      </div>
      {rest && <div className="mt-10 space-y-10 lg:col-start-1 lg:row-start-2 lg:mt-8">{rest}</div>}
    </div>
  )
}
