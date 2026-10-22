import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { lifecycleGateForStaff } from '@/modules/staff/guards'
import { SETTINGS_ADMIN_ONLY_NOTICE } from '@/modules/staff/roles'
import { getStaffRole } from '@/modules/staff/staff.service'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import {
  getWhatsappPlusState,
  registerWhatsappConnection,
} from '@/modules/whatsapp-bot/whatsapp-bot.connection'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Vuelta de Kapso tras conectar el número (navegación top-level desde
 * app.kapso.ai). Éxito: `phone_number_id`, `display_phone_number`…; fallo:
 * `error_code` o el `fallo=1` que le pusimos a la URL de fallo.
 *
 * Los parámetros no prueban nada (cualquiera arma la URL): lo que autoriza es la
 * sesión de un admin del complejo, y `registerWhatsappConnection` verifica en
 * Kapso que el número sea de SU cliente. Las redirecciones salen de
 * NEXT_PUBLIC_APP_URL, nunca del host del request.
 */
const querySchema = z.object({
  // Va a un path de la API de Kapso: `..` o `/` lo harían salir de ese recurso.
  phone_number_id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[\w-]+$/)
    .optional(),
  error_code: z.string().max(100).optional(),
  fallo: z.string().max(10).optional(),
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return new NextResponse('Falta configurar NEXT_PUBLIC_APP_URL.', { status: 500 })
  const to = (path: string) => NextResponse.redirect(new URL(path, appUrl))
  const settings = (qs: string) => to(`/settings/whatsapp?${qs}`)

  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) return to('/login')
  const tenant = await getStaffTenant(user.staffUserId, user.tenantId)
  if (!tenant) return to('/login')
  // Mismo gate que requireAdminStaff para una escritura: este GET no pasa por
  // (admin)/layout. Bloqueado → /suspended; solo lectura → /reactivar.
  const gate = await lifecycleGateForStaff(tenant)
  if (gate === 'blocked') return to('/suspended')
  if (gate === 'read_only') return to('/reactivar')
  // El rol se relee de la DB: el claim del JWT nunca se confía. El encargado
  // rebota igual que en settings/layout.tsx, con el aviso de Ajustes.
  if ((await getStaffRole(tenant.id, user.staffUserId)) !== 'admin') {
    return to(`/grilla?notice=${SETTINGS_ADMIN_ONLY_NOTICE}`)
  }
  if ((await getWhatsappPlusState(tenant.id)) === null) return to('/settings')

  const q = req.nextUrl.searchParams
  const parsed = querySchema.safeParse({
    phone_number_id: q.get('phone_number_id') ?? undefined,
    error_code: q.get('error_code') ?? undefined,
    fallo: q.get('fallo') ?? undefined,
  })
  if (
    !parsed.success ||
    parsed.data.fallo ||
    parsed.data.error_code ||
    !parsed.data.phone_number_id
  ) {
    return settings('error=conexion_incompleta')
  }

  const result = await registerWhatsappConnection(
    { id: tenant.id, name: tenant.name },
    parsed.data.phone_number_id,
    user.staffUserId,
  )
  if (!result.ok) return settings(`error=${result.error}`)
  return settings('conectado=1')
}
