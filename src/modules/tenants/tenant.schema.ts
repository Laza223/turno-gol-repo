import { z } from 'zod'
import { phone } from '@/shared/validation/primitives'

export const createTenantSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
  address: z.string().min(5, 'Dirección muy corta').max(200, 'Máximo 200 caracteres'),
  city: z.string().min(2, 'Ciudad muy corta').max(100, 'Máximo 100 caracteres'),
  province: z.string().min(2, 'Provincia muy corta').max(100, 'Máximo 100 caracteres'),
  phone,
  email: z.email('Email inválido'),
})

/**
 * Paso 1 en revisita (`updateWizardTenantAction`): el wizard ya no pide
 * teléfono/email ahí (se derivan de la cuenta staff al crear, doc10 §2 — "NO
 * pedir: teléfono del complejo, email del complejo"), así que editar ese paso
 * no puede tocar esas dos columnas — se editan aparte en `/settings/perfil`
 * (`tenantContactSchema` abajo). Sin este recorte, un update parcial de
 * verdad (`UpdateTenantInput` es `Partial<...>`) igual requeriría mandar
 * phone/email en el FormData para pasar `createTenantSchema` completo.
 */
export const updateTenantIdentitySchema = createTenantSchema.pick({
  name: true,
  address: true,
  city: true,
  province: true,
})

/**
 * Contacto público del complejo, editable desde `/settings/perfil` (B15).
 *
 * `whatsapp` es opcional y NO está en `createTenantSchema`: al crear el
 * complejo no se pide (igual que teléfono y email, doc10 §2). La columna
 * existía desde la migración 003 y se leía en el perfil público, pero hasta
 * ahora no había NINGUNA pantalla para cargarla — o sea que en la práctica
 * estaba siempre en NULL. Vacío se guarda como NULL, no como cadena vacía, para
 * que la cascada `whatsapp ?? phone` de `resolveTenantContact` caiga al
 * teléfono en vez de quedarse con un dato que no sirve.
 */
export const tenantContactSchema = createTenantSchema.pick({ phone: true, email: true }).extend({
  whatsapp: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .pipe(phone.nullable()),
})
