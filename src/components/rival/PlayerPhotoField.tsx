'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'
import { resizeToPreset } from '@/shared/images/resize-image'
import type { RivalPhotoResult } from '@/app/(player)/rival/photo-actions'

/** Firmas de las Server Actions (llegan por prop: importarlas como valor arrastra drizzle al bundle del browser). */
export type PhotoUploadAction = (formData: FormData) => Promise<RivalPhotoResult>
export type PhotoRemoveAction = () => Promise<RivalPhotoResult>

const OFFLINE = 'No pudimos conectar. Revisá tu conexión y probá de nuevo.'
const BUTTON = 'h-auto min-h-11 md:h-auto'

/**
 * La foto de perfil del jugador (RIVAL). Se sube sola al elegir el archivo: el cliente la recorta
 * cuadrada y la achica antes de mandarla. Sin foto, el círculo muestra las iniciales.
 */
export function PlayerPhotoField({
  url: initialUrl,
  initials,
  uploadAction,
  removeAction,
  compact = false,
}: {
  url: string | null
  initials: string
  uploadAction: PhotoUploadAction
  removeAction: PhotoRemoveAction
  /** Fila baja (avatar chico y un botón "Agregar foto (opcional)"): para tarjetas donde la foto no es obligatoria. */
  compact?: boolean
}) {
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /** Corre una action y pinta su resultado; una excepción (sin red) cae en el mismo aviso. */
  async function run(call: () => Promise<RivalPhotoResult>) {
    setError(null)
    setBusy(true)
    try {
      const res = await call()
      if (res.success) setUrl(res.url)
      else setError(res.error)
    } catch (err) {
      setError(err instanceof Error && err.message.startsWith('El archivo') ? err.message : OFFLINE)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleFile(file: File) {
    void run(async () => {
      const blob = await resizeToPreset(file, 'logo')
      const fd = new FormData()
      fd.set('file', blob, 'foto.webp')
      return uploadAction(fd)
    })
  }

  return (
    <div className="space-y-2">
      {/* Input real disparado por el botón visible; fuera del árbol accesible para que no haya dos controles iguales. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-hidden="true"
        tabIndex={-1}
        disabled={busy}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      <div className={compact ? 'flex items-center gap-3' : 'flex items-center gap-4'}>
        <div
          className={cn(
            'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-50 font-display font-black italic',
            compact ? 'size-11 text-base' : 'size-20 text-2xl',
            ' text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
          )}
          aria-busy={busy}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto de usuario en R2, ya viene a 512 px
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <span aria-hidden>{initials}</span>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-xs">
              <TgBallSpinner size="sm" aria-hidden />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className={BUTTON}
          >
            {url ? 'Cambiar foto' : compact ? 'Agregar foto (opcional)' : 'Subir foto'}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void run(removeAction)}
              className={BUTTON}
            >
              Quitar
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[13px] leading-5 text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}
