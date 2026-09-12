'use client'

import { useState, type ReactNode } from 'react'
import { CheckCircle2, ImagePlus } from 'lucide-react'
import { ImageUploader } from '@/components/ui/image-uploader'
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
  tenantName: string
  tenantAddress: string
  tenantCity: string
  logoUrl: string | null
  coverUrl: string | null
  setImageAction: SetTenantImageAction
  removeImageAction: RemoveTenantImageAction
}

/**
 * Maqueta no-interactiva de cómo queda la cabecera del perfil público (cover +
 * logo + nombre + dirección) — antes había que subir la imagen a ciegas y
 * abrir "Ver mi perfil público" en otra pestaña para comprobar el resultado.
 */
function PublicHeaderPreview({
  tenantName,
  tenantAddress,
  tenantCity,
  logoUrl,
  coverUrl,
}: {
  tenantName: string
  tenantAddress: string
  tenantCity: string
  logoUrl: string | null
  coverUrl: string | null
}) {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-2xl border border-border bg-muted/40"
    >
      <div className="relative h-24 w-full overflow-hidden bg-muted sm:h-32">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview genérico, no necesita next/image
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImagePlus className="h-5 w-5" />
            <span className="text-xs">Portada · todavía no subiste una</span>
          </div>
        )}
      </div>
      <div className="-mt-6 flex items-end gap-3 px-4 pb-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border-2 border-card bg-card shadow-xs">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview genérico, no necesita next/image
            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
              <ImagePlus className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="min-w-0 pb-0.5">
          <p className="truncate text-sm font-semibold text-foreground">{tenantName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {tenantAddress}, {tenantCity}
          </p>
        </div>
      </div>
    </div>
  )
}

/** Fila compacta "Portada"/"Logo": nombre + ayuda + estado + el ImageUploader. */
function ImageRow({
  label,
  help,
  hasImage,
  children,
}: {
  label: string
  help: string
  hasImage: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{label}</h3>
          {hasImage ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Cargada
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Sin imagen</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      {children}
    </div>
  )
}

export function PerfilImagesForm({
  tenantName,
  tenantAddress,
  tenantCity,
  logoUrl: initialLogo,
  coverUrl: initialCover,
  setImageAction,
  removeImageAction,
}: Props) {
  const [logoUrl, setLogoUrl] = useState(initialLogo)
  const [coverUrl, setCoverUrl] = useState(initialCover)
  // Feedback inline (role="status"/"alert"): mismo patrón que
  // TenantContactForm/TenantLocationForm, en vez del toast que tenía antes
  // esta sección — era el único bloque de /settings/perfil que confirmaba el
  // guardado con un mecanismo distinto al resto de la pantalla (H051).
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function upload(kind: 'logo' | 'cover', blob: Blob) {
    setFeedback(null)
    const fd = new FormData()
    fd.set('file', blob, `${kind}.webp`)
    const previous = kind === 'logo' ? logoUrl : coverUrl
    if (previous) fd.set('previousUrl', previous)
    const result = await setImageAction(kind, fd)
    if (!result.success) {
      setFeedback({ type: 'error', text: result.error })
      return
    }
    if (kind === 'logo') setLogoUrl(result.url)
    else setCoverUrl(result.url)
    setFeedback({
      type: 'success',
      text:
        kind === 'logo' ? 'Logo actualizado correctamente' : 'Portada actualizada correctamente',
    })
  }

  async function remove(kind: 'logo' | 'cover', url: string) {
    setFeedback(null)
    const result = await removeImageAction(kind, url)
    if (!result.success) {
      setFeedback({ type: 'error', text: result.error })
      return
    }
    if (kind === 'logo') setLogoUrl(null)
    else setCoverUrl(null)
    setFeedback({ type: 'success', text: kind === 'logo' ? 'Logo eliminado' : 'Portada eliminada' })
  }

  return (
    <div className="space-y-5">
      <PublicHeaderPreview
        tenantName={tenantName}
        tenantAddress={tenantAddress}
        tenantCity={tenantCity}
        logoUrl={logoUrl}
        coverUrl={coverUrl}
      />

      <div className="divide-y divide-border/60">
        <ImageRow
          label="Portada"
          help="Foto ancha (JPG o PNG, mínimo 1200 px de ancho)"
          hasImage={!!coverUrl}
        >
          <ImageUploader
            preset="cover"
            value={coverUrl ?? ''}
            onUpload={(blob) => upload('cover', blob)}
            onRemove={(url) => remove('cover', url)}
            emptyLabel="Subí una portada"
          />
        </ImageRow>

        <ImageRow label="Logo" help="Cuadrado (mínimo 200 × 200 px)" hasImage={!!logoUrl}>
          <ImageUploader
            preset="logo"
            value={logoUrl ?? ''}
            onUpload={(blob) => upload('logo', blob)}
            onRemove={(url) => remove('logo', url)}
            emptyLabel="Subí el logo de tu complejo"
          />
        </ImageRow>
      </div>

      {feedback && (
        <p
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={
            feedback.type === 'error'
              ? 'text-sm text-red-600 dark:text-red-400'
              : 'text-sm text-emerald-700 dark:text-emerald-400'
          }
        >
          {feedback.text}
        </p>
      )}
    </div>
  )
}
