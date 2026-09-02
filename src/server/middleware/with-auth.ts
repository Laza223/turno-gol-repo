// Vive en `@/server` (composition root del runtime web), no en `@/shared`: ver
// el bloque `turnogol/capas-server` de eslint.config.mjs.
import type { NextRequest, NextResponse } from 'next/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import type { AuthUser } from '@/modules/auth/types'
import { captureException } from '@/lib/sentry'
import { internal, unauthorized } from '@/shared/api-error'
import { runRequestObservability } from '@/shared/middleware/observability'

export type AuthHandler = (req: NextRequest, user: AuthUser) => Promise<NextResponse> | NextResponse

export function withAuth(handler: AuthHandler): (req: NextRequest) => Promise<NextResponse> {
  const run = async (req: NextRequest): Promise<NextResponse> => {
    const user = await extractAuthUser()
    if (!user) {
      return unauthorized('Autenticación requerida.', { code: 'AUTH_REQUIRED' })
    }
    try {
      return await handler(req, user)
    } catch (err) {
      captureException(err)
      return internal('Ocurrió un error inesperado. Probá de nuevo en unos segundos.')
    }
  }
  return (req) => runRequestObservability(req, () => run(req))
}
