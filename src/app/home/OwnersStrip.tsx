import Link from 'next/link'
import { PORTAL_LINK } from '@/components/world/PortalAuthFrame'

/** La franja de dueños, al pie de la home: una línea y la puerta a `/para-complejos`. */
export function OwnersStrip() {
  return (
    <section aria-label="Para complejos" className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 lg:px-8">
        <p className="text-base text-muted-foreground">
          ¿Tenés un complejo? Llevá tus reservas y tu grilla en TurnoGol.
        </p>
        <Link
          href="/para-complejos"
          className={`-mx-1 inline-flex min-h-11 items-center self-start px-1 text-base font-semibold text-emerald-700 underline underline-offset-4 dark:text-emerald-400 sm:self-auto ${PORTAL_LINK}`}
        >
          Conocé TurnoGol para complejos
        </Link>
      </div>
    </section>
  )
}
