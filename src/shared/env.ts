import { z } from 'zod'

const minLen = (n: number, name: string) =>
  z.string().min(n, `${name} must be at least ${n} chars`)

function makeSchema(isProd: boolean) {
  return z.object({
    DATABASE_URL: z.string().min(1),
    NEXT_PUBLIC_APP_URL: isProd ? z.url() : z.url().optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    IMPERSONATION_COOKIE_SECRET: minLen(16, 'IMPERSONATION_COOKIE_SECRET'),
    ENCRYPTION_KEY: minLen(32, 'ENCRYPTION_KEY'),
    MP_CLIENT_ID: z.string().min(1),
    MP_CLIENT_SECRET: z.string().min(1),
    MP_WEBHOOK_SECRET: isProd ? minLen(16, 'MP_WEBHOOK_SECRET') : minLen(16, 'MP_WEBHOOK_SECRET').optional(),
    RESEND_API_KEY: z.string().min(1),
    UPSTASH_REDIS_REST_URL: isProd ? z.url() : z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: isProd ? z.string().min(20) : z.string().min(20).optional(),
    VAPID_PUBLIC_KEY: isProd ? minLen(80, 'VAPID_PUBLIC_KEY') : minLen(80, 'VAPID_PUBLIC_KEY').optional(),
    VAPID_PRIVATE_KEY: isProd ? minLen(40, 'VAPID_PRIVATE_KEY') : minLen(40, 'VAPID_PRIVATE_KEY').optional(),
    VAPID_SUBJECT: isProd ? z.string().regex(/^mailto:.+@.+$/, 'VAPID_SUBJECT must be mailto:email') : z.string().regex(/^mailto:.+@.+$/).optional(),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: isProd ? minLen(80, 'NEXT_PUBLIC_VAPID_PUBLIC_KEY') : minLen(80, 'NEXT_PUBLIC_VAPID_PUBLIC_KEY').optional(),
    // Allowlist de emails del panel SuperAdmin (lista separada por comas).
    // Opcional en ambos modos: el guard es fail-closed (sin la var, nadie pasa
    // requireSystemAdmin) y su ausencia no debe romper el arranque de la app.
    SYSTEM_ADMIN_EMAILS: z.string().optional(),
    R2_ACCOUNT_ID: isProd ? z.string().min(1) : z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: isProd ? z.string().min(1) : z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: isProd ? z.string().min(1) : z.string().min(1).optional(),
    R2_BUCKET: isProd ? z.string().min(1) : z.string().min(1).optional(),
    R2_PUBLIC_BASE_URL: isProd ? z.url() : z.url().optional(),
  })
}

export type ServerEnv = z.infer<ReturnType<typeof makeSchema>>

export function validateServerEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): ServerEnv {
  const isProd = (env.NODE_ENV ?? 'development') === 'production'
  const schema = makeSchema(isProd)
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment: ${issues}`)
  }
  return parsed.data
}
