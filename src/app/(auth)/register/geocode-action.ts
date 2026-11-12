'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { enforce } from '@/shared/rate-limit/apply'
import { parseClientIp } from '@/shared/rate-limit/key'
import { searchAddress, type GeocodeCandidate } from '@/modules/tenants/geocode.service'

const schema = z.object({ address: z.string().trim().min(1).max(200) })

/**
 * Buscador de dirección del alta pública. En /register todavía no hay sesión, así que
 * no sirve el de Configuración (exige staff): acá se frena por IP y se le pregunta a
 * Georef lo mismo. Cualquier falla vuelve como `success: false` y la UI deja cargarla a mano.
 */
export async function searchSignupAddressAction(input: {
  address: string
}): Promise<{ success: true; candidates: GeocodeCandidate[] } | { success: false; error: string }> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Escribí una dirección para buscar.' }
  const ip = parseClientIp((await headers()) as unknown as Headers)
  const limit = await enforce('publicAvailability', ip)
  if (!limit.ok) return { success: false, error: 'Demasiadas búsquedas. Probá en un minuto.' }
  return { success: true, candidates: await searchAddress(parsed.data) }
}
