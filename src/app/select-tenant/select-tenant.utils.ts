import type { StaffTenantRow } from '@/modules/auth/auth.service'

/**
 * Autorización: un staff sólo puede activar un tenant al que efectivamente
 * pertenece (is_active en tenant_staff_members y status operable). Función pura,
 * separada del archivo 'use server' para poder testearla sin Supabase ni DB
 * (los módulos 'use server' sólo pueden exportar funciones async).
 */
export function isMemberTenant(tenantId: string, tenants: StaffTenantRow[]): boolean {
  return tenants.some((t) => t.tenantId === tenantId)
}
