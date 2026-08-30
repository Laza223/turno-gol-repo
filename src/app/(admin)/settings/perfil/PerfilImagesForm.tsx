'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import { ImageUploader } from '@/components/ui/image-uploader'
import { toast } from '@/hooks/use-toast'
import type { TenantImageActionResult } from './actions'

/** Firmas de setTenantImageAction/removeTenantImageAction — DI, ver ReservasPolicyForm.tsx. */
type SetTenantImageAction = (
  kind: 'logo' | 'cover',
  formData: FormData,
) => Promise<TenantImageActionResult>
type RemoveTenantImageAction = (
  kind: 'logo' | 'cover',
  previousUrl: string | null,
) => Promise<{ success: true } | { success: false; error: string }>

type Props = {
  logoUrl: string | null
  coverUrl: string | null
  setImageAction: SetTenantImageAction
  removeImageAction: RemoveTenantImageAction
}

export function PerfilImagesForm({
  logoUrl: initialLogo,
  coverUrl: initialCover,
  setImageAction,
  removeImageAction,
}: Props) {
  const [logoUrl, setLogoUrl] = useState(initialLogo)
  const [coverUrl, setCoverUrl] = useState(initialCover)
  const [error, setError] = useState<string | null>(null)

  async function upload(kind: 'logo' | 'cover', blob: Blob) {
    setError(null)
    const fd = new FormData()
    fd.set('file', blob, `${kind}.webp`)
    const previous = kind === 'logo' ? logoUrl : coverUrl
    if (previous) fd.set('previousUrl', previous)
    const result = await setImageAction(kind, fd)
    if (!result.success) {
      setError(result.error)
      toast({
        title: kind === 'logo' ? 'Error al actualizar el logo' : 'Error al actualizar la portada',
        description: result.error,
        variant: 'destructive',
      })
      return
    }
    if (kind === 'logo') setLogoUrl(result.url)
    else setCoverUrl(result.url)
    toast({
      title:
        kind === 'logo' ? 'Logo actualizado correctamente' : 'Portada actualizada correctamente',
      variant: 'success',
    })
  }

  async function remove(kind: 'logo' | 'cover', url: string) {
    setError(null)
    const result = await removeImageAction(kind, url)
    if (!result.success) {
      setError(result.error)
      toast({
        title: kind === 'logo' ? 'Error al eliminar el logo' : 'Error al eliminar la portada',
        description: result.error,
        variant: 'destructive',
      })
      return
    }
    if (kind === 'logo') setLogoUrl(null)
    else setCoverUrl(null)
    toast({
      title: kind === 'logo' ? 'Logo eliminado' : 'Portada eliminada',
      variant: 'success',
    })
  }

  return (
    <div className="space-y-8">
      {/* Sección Logo */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Logo del complejo</h3>
          <p className="text-xs text-muted-foreground">
            Se muestra en las tarjetas del explorador y en la cabecera de tu perfil público.
          </p>
        </div>

        {/* Guía visual y especificaciones de dimensiones para Logo */}
        <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card shadow-xs"
              aria-hidden="true"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-xs border border-dashed border-emerald-500/80 bg-emerald-500/10 text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                1:1
              </div>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-foreground">Tamaño recomendado:</span>
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  512 × 512 px
                </span>
                <span className="text-[11px] text-muted-foreground">(Mínimo 200 × 200 px)</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Proporción cuadrada (1:1) · PNG o WebP con fondo transparente o sólido.
              </p>
            </div>
          </div>
        </div>

        <ImageUploader
          preset="logo"
          value={logoUrl ?? ''}
          onUpload={(blob) => upload('logo', blob)}
          onRemove={(url) => remove('logo', url)}
          emptyLabel="Subí el logo de tu complejo"
        />
      </div>

      {/* Sección Portada */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Foto de Portada (Banner)</h3>
          <p className="text-xs text-muted-foreground">
            Banner panorámico horizontal principal en la parte superior de tu perfil público.
          </p>
        </div>

        {/* Guía visual y especificaciones de dimensiones para Portada */}
        <div className="space-y-2.5 rounded-xl border border-border/70 bg-muted/30 p-3.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg border border-border bg-card shadow-xs"
                aria-hidden="true"
              >
                <div className="flex h-5 w-12 items-center justify-center rounded-xs border border-dashed border-emerald-500/80 bg-emerald-500/10 text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  16:9
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">Tamaño recomendado:</span>
                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    1600 × 900 px
                  </span>
                  <span className="text-[11px] text-muted-foreground">(Mín. 1200 px de ancho)</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Proporción panorámica horizontal (16:9 o 21:9) · Formatos JPG, PNG o WebP.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border/40 bg-card/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <Info
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <span>
              <strong className="font-semibold text-foreground">Consejo:</strong> Usá fotos
              panorámicas de tus canchas o instalaciones iluminadas. Evitá capturas de pantalla con
              textos pequeños para que luzca perfecto en celulares y computadoras.
            </span>
          </div>
        </div>

        <ImageUploader
          preset="cover"
          value={coverUrl ?? ''}
          onUpload={(blob) => upload('cover', blob)}
          onRemove={(url) => remove('cover', url)}
          emptyLabel="Subí una portada"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
