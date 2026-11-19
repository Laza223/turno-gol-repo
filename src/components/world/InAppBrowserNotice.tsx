'use client'

import { useId, useState } from 'react'
import { GoogleIcon } from '@/components/icons/GoogleIcon'
import { Button } from '@/components/ui/button'
import { PORTAL_BUTTON_OUTLINE } from '@/components/world/portal-auth-styles'
import { externalBrowserUrl } from '@/lib/in-app-browser'
import { cn } from '@/lib/utils'

/**
 * Va en lugar de "Continuar con Google" en el navegador interno de una app (Instagram,
 * Facebook…; lo decide el servidor con `isInAppBrowser`). Google no deja entrar desde un WebView
 * (`disallowed_useragent`), así que el botón no inicia el ingreso: le pide al teléfono abrir esta
 * misma página en el navegador (`externalBrowserUrl`, con el turno elegido y el `next`), y ahí, con
 * el UA de un navegador, el jugador toca el botón de Google de verdad.
 *
 * Ese salto no es una API: Instagram lo acepta hoy en iPhone solo desde un toque y puede dejar de
 * hacerlo. Si no anduvo, la única salida que se le pide al jugador es la que ya tiene a la vista, el
 * email (va arriba de este bloque): nada de copiar enlaces ni buscar el menú de la app.
 * Lo usan /ingresar y el ingreso de /reservar y de RIVAL: otra variante del ingreso tiene que
 * reusarlo.
 * `glass`: la piel del portal de vidrio (tokens `portal-*`, que solo existen bajo `data-portal-glass`);
 * sin eso queda la de La Previa.
 */
export function InAppBrowserNotice({ glass = false }: { glass?: boolean }) {
  const helpId = useId()
  const [tried, setTried] = useState(false)

  function openInBrowser() {
    setTried(true)
    const url = externalBrowserUrl(navigator.userAgent, window.location.href)
    if (url) window.location.href = url
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        {...(glass
          ? ({
              variant: 'pill-glass',
              size: 'pill',
              className: 'w-full backdrop-filter-none',
            } as const)
          : ({ variant: 'outline', className: PORTAL_BUTTON_OUTLINE } as const))}
        aria-describedby={helpId}
        onClick={openInBrowser}
      >
        <GoogleIcon className={glass ? 'size-5' : 'mr-2 size-5'} />
        Continuar con Google
      </Button>
      <p
        id={helpId}
        aria-live="polite"
        className={cn('text-pretty text-sm', glass ? 'text-portal-muted' : 'text-muted-foreground')}
      >
        {tried
          ? 'Si no se abrió tu navegador, entrá con tu email.'
          : 'Te abrimos tu navegador para que entres con Google.'}
      </p>
    </div>
  )
}
