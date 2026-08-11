import { z } from 'zod'

export const createTenantSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(100),
  address: z.string().min(5, 'Dirección muy corta').max(200),
  city: z.string().min(2, 'Ciudad muy corta').max(100),
  province: z.string().min(2, 'Provincia muy corta').max(100),
  phone: z.string().min(8, 'Teléfono inválido').max(25),
  email: z.email('Email inválido'),
})
