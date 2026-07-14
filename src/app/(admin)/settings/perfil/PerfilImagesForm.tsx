'use client'

import { useState } from 'react'
import { ImageUploader } from '@/components/ui/image-uploader'
import type { TenantImageActionResult } from './actions'

/** Firmas de setTenantImageAction/removeTenantImageAction — DI, ver ReservasPolicyForm.tsx. */
export type SetTenantImageAction = (
  kind: 'logo' | 'cover',
  formData: FormData,
) => Promise<TenantImageActionResult>
export type RemoveTenantImageAction = (
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
      return
    }
    if (kind === 'logo') setLogoUrl(result.url)
    else setCoverUrl(result.url)
  }

  async function remove(kind: 'logo' | 'cover', url: string) {
    setError(null)
    const result = await removeImageAction(kind, url)
    if (!result.success) {
      setError(result.error)
      return
    }
    if (kind === 'logo') setLogoUrl(null)
    else setCoverUrl(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Logo</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Se muestra en las cards del explorador y en tu perfil público.
        </p>
        <ImageUploader
          preset="logo"
          value={logoUrl ?? ''}
          onUpload={(blob) => upload('logo', blob)}
          onRemove={(url) => remove('logo', url)}
          emptyLabel="Subí el logo de tu complejo"
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Portada</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Banner grande en la parte superior de tu perfil público.
        </p>
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
