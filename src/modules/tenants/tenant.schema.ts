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

/** Contacto público del complejo, editable desde `/settings/perfil` (B15). */
export const tenantContactSchema = createTenantSchema.pick({ phone: true, email: true })
