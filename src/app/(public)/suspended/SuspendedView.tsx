import Link from 'next/link'
import { PauseCircle } from 'lucide-react'
import { SUPPORT_EMAIL } from '@/shared/constants'
import { SwitchTenantLink } from '@/app/(public)/SwitchTenantLink'

type Props = {
  /** AUD-01: la salida solo se ofrece si hay a dónde ir. Lo resuelve `page.tsx`. */
  mostrarCambioDeComplejo: boolean
}

/**
 * La pantalla, sin nada de sesión adentro.
 *
 * Vive separada de `page.tsx` porque desde AUD-01 la página resuelve la sesión,
 * y eso arrastra `node:async_hooks` — que en el navegador no existe. La story
 * importaba la página y dejó de poder cargarla. Acá el árbol es puro y se
 * renderiza igual en Storybook que en el servidor.
 */
export function SuspendedView({ mostrarCambioDeComplejo }: Props) {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 ring-8 ring-amber-50 dark:bg-amber-500/10 dark:ring-amber-400/20">
        <PauseCircle className="h-8 w-8 text-amber-600 dark:text-amber-300" aria-hidden />
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Tu cuenta está temporalmente suspendida
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        El acceso al panel de tu complejo está pausado por el momento. Tus datos están a salvo y no
        se perdió nada. En cuanto se regularice la situación vas a poder volver a operar
        normalmente.
      </p>

      <Link
        href="/reactivar"
        className="mt-8 inline-flex h-11 items-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Soy el dueño — regularizar el pago
      </Link>

      {/* MEJORA-UX QA (WCAG 2.5.8, ≥24px): medían 20px de alto con 8px de
          separación — mismo patrón `min-h-11 md:min-h-0` que ya usa el resto
          del repo para links de texto (ver "¿Olvidaste tu contraseña?" en
          LoginCard.tsx). */}
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground md:min-h-0"
      >
        Contactar a soporte
      </a>

      {mostrarCambioDeComplejo && <SwitchTenantLink />}

      <Link
        href="/"
        className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground md:min-h-0"
      >
        Volver al inicio
      </Link>
    </section>
  )
}
