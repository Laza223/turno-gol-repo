'use client'

import { useState } from 'react'
import { Copy, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PORTAL_BUTTON_OUTLINE } from '@/components/world/portal-auth-styles'
import { cn } from '@/lib/utils'

/**
 * Va en lugar de "Continuar con Google" en el navegador interno de una app (Instagram,
 * Facebook…; lo decide el servidor con `isInAppBrowser`). Google no deja entrar desde un WebView
 * (`disallowed_useragent`) y el botón terminaba en su pantalla de error. Acá están las dos salidas:
 * abrir la página en el navegador con el menú de la app, o copiar el enlace y pegarlo. Se copia la
 * URL de ese momento, con el turno elegido y el `next`. El email, que sí anda, va arriba.
 * Lo usan /ingresar y el ingreso de /reservar: otra variante del ingreso tiene que reusarlo.
 * `glass`: la piel del portal de vidrio (tokens `portal-*`, que solo existen bajo `data-portal-glass`);
 * sin eso queda la de La Previa.
 */
export function InAppBrowserNotice({ glass = false }: { glass?: boolean }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopy('copied')
    } catch {
      // Sin portapapeles (WebView viejo) o con la escritura rechazada: queda el menú de la app.
      setCopy('failed')
    }
  }

  return (
    <div
      className={cn(
        'space-y-3 border p-4',
        glass
          ? 'rounded-[20px] border-portal-inner-line bg-portal-inner'
          : 'rounded-xl border-border bg-muted',
      )}
    >
      <div className="space-y-1">
        <p className={cn('text-base font-semibold', glass ? 'text-portal-ink' : 'text-foreground')}>
          ¿Querés entrar con Google?
        </p>
        <p
          className={cn(
            'text-pretty text-sm',
            glass ? 'text-portal-muted' : 'text-muted-foreground',
          )}
        >
          No funciona dentro de esta app. Tocá{' '}
          <MoreHorizontal className="inline size-4 align-[-0.2em]" aria-hidden />
          <span className="sr-only">los tres puntos</span> arriba a la derecha y elegí abrir en el
          navegador. O copiá el enlace y pegalo en Chrome o Safari.
        </p>
      </div>
      <Button
        type="button"
        {...(glass
          ? ({
              variant: 'pill-glass',
              size: 'pill',
              className: 'w-full backdrop-filter-none',
            } as const)
          : ({ variant: 'outline', className: PORTAL_BUTTON_OUTLINE } as const))}
        onClick={copyLink}
      >
        <Copy className={glass ? 'size-4' : 'mr-2 size-4'} aria-hidden />
        Copiar enlace
      </Button>
      {copy !== 'idle' && (
        <p role="status" className={glass ? 'rv-small' : 'text-sm text-muted-foreground'}>
          {copy === 'copied'
            ? 'Enlace copiado. Pegalo en Chrome o Safari.'
            : 'No se pudo copiar. Usá los tres puntos de arriba a la derecha.'}
        </p>
      )}
    </div>
  )
}
