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
