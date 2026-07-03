'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { updateTenant } from '@/modules/tenants/tenant.service'
import {
  isR2Configured,
  putImage,
  deleteImage,
  publicUrl,
  keyFromPublicUrl,
} from '@/shared/storage/r2'

export type TenantImageActionResult =
  | { success: true; url: string }
  | { success: false; error: string }

const MAX_BYTES = 2 * 1024 * 1024

function isOwnedByTenant(key: string | null, tenantId: string): key is string {
  return key !== null && key.startsWith(`${tenantId}/`)
}

async function deletePreviousIfOwned(previousUrl: string | null, tenantId: string) {
  if (!previousUrl) return
  const key = keyFromPublicUrl(previousUrl)
  if (isOwnedByTenant(key, tenantId)) await deleteImage(key)
}

export async function setTenantImageAction(
  kind: 'logo' | 'cover',
  formData: FormData,
): Promise<TenantImageActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  if (!isR2Configured()) {
    console.warn('[storage] R2 no configurado — upload deshabilitado en este entorno')
    return { success: false, error: 'Storage no configurado en este entorno' }
  }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const file = formData.get('file')
  if (!(file instanceof Blob) || file.size === 0) {
    return { success: false, error: 'Archivo inválido' }
  }
  if (file.size > MAX_BYTES) {
    return { success: false, error: 'La imagen no puede superar 2MB' }
  }

  const previousUrl = formData.get('previousUrl')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const key = `${tenant.id}/${kind}-${crypto.randomUUID()}.webp`

  await putImage(key, bytes, 'image/webp')
  await deletePreviousIfOwned(typeof previousUrl === 'string' ? previousUrl : null, tenant.id)

  const url = publicUrl(key)
  await updateTenant(tenant.id, kind === 'logo' ? { logoUrl: url } : { coverUrl: url })

  revalidatePath('/settings/perfil')
  revalidatePath(`/${tenant.slug}`)
  return { success: true, url }
}

export async function removeTenantImageAction(
  kind: 'logo' | 'cover',
  previousUrl: string | null,
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  if (!isR2Configured()) {
    console.warn('[storage] R2 no configurado — borrado deshabilitado en este entorno')
    return { success: false, error: 'Storage no configurado en este entorno' }
  }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const key = keyFromPublicUrl(previousUrl ?? '')
  if (!isOwnedByTenant(key, tenant.id)) {
    return { success: false, error: 'Imagen inválida' }
  }

  await deleteImage(key)
  await updateTenant(tenant.id, kind === 'logo' ? { logoUrl: null } : { coverUrl: null })

  revalidatePath('/settings/perfil')
  revalidatePath(`/${tenant.slug}`)
  return { success: true }
}
