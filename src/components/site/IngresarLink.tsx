'use client'

import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

type Props = { className?: string; children: ReactNode }

/**
 * `next` viaja codificado entero (path + query) para que el `&` de la query no se
 * confunda con otro parámetro de /ingresar. Sin pathname cae al login pelado.
 * `sanitizeNext` valida el valor en /ingresar, en las actions y en el callback.
 */
const hrefFor = (pathname: string | null, search = '') =>
  pathname ? `/ingresar?next=${encodeURIComponent(pathname + search)}` : '/ingresar'

function IngresarLinkConQuery({ className, children }: Props) {
  const pathname = usePathname()
  const query = useSearchParams().toString()
  return (
    <Link href={hrefFor(pathname, query && `?${query}`)} className={className}>
      {children}
    </Link>
  )
}

/**
 * "Ingresar" que vuelve a la página donde estaba el jugador. `useSearchParams()` hace
 * que el render estático/ISR salte al cliente hasta el `Suspense` más cercano: el
 * fallback es el mismo link con solo el pathname, así el HTML estático ya trae un
 * destino válido y la query se suma al hidratar.
 */
export function IngresarLink({ className, children }: Props) {
  const pathname = usePathname()
  return (
    <Suspense
      fallback={
        <Link href={hrefFor(pathname)} className={className}>
          {children}
        </Link>
      }
    >
      <IngresarLinkConQuery className={className}>{children}</IngresarLinkConQuery>
    </Suspense>
  )
}
