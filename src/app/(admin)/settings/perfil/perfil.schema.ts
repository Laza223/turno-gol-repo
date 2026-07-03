import { z } from 'zod'

export const tenantImageKindSchema = z.enum(['logo', 'cover'])
