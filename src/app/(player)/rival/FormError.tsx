import Link from 'next/link'
import { IngresarLink } from '@/components/site/IngresarLink'

const ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'
const LINK =
  'inline-flex min-h-11 items-center text-[13px] font-medium underline underline-offset-4'
/** Topes y envíos sin confirmar: se resuelven mirando Mis partidos. */
const MY_MATCHES_CODES: ReadonlySet<string> = new Set([
  'rival_limit_active',
  'rival_limit_requests',
  'unconfirmed',
])

/**
 * El error de una acción de RIVAL con la salida que le toca: sesión vencida → "Ingresar"; tope o
 * envío sin confirmar → "Ver mis partidos". Sin `code`, solo el mensaje.
 */
export function FormError({ error, code }: { error: string; code?: string }) {
  return (
    <div>
      <p role="alert" className={ERROR}>
        {error}
      </p>
      {code === 'no_session' && <IngresarLink className={LINK}>Ingresar</IngresarLink>}
      {code !== undefined && MY_MATCHES_CODES.has(code) && (
        <Link href="/rival/mis-partidos" className={LINK}>
          Ver mis partidos
        </Link>
      )}
    </div>
  )
}
