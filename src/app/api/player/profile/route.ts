import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { withPlayer } from '@/shared/middleware/with-player'
import { badRequest, notFound, validationError } from '@/shared/api-error'
import { players } from '@/shared/db/schema'

export const dynamic = 'force-dynamic'

export const GET = withPlayer(async (_req, user, tx) => {
  const rows = await tx
    .select()
    .from(players)
    .where(eq(players.id, user.playerId))
    .limit(1)

  if (!rows[0]) {
    return notFound('El jugador no existe.')
  }

  return NextResponse.json({ data: { player: rows[0] } })
})

const patchSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  phone: z.string().min(6).max(30).optional(),
  preferred_area: z.string().max(100).optional(),
})

export const PATCH = withPlayer(async (req, user, tx) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error, { status: 422 })
  }

  const { first_name, last_name, phone, preferred_area } = parsed.data
  const updates: Record<string, string | null> = {}
  if (first_name !== undefined) updates.firstName = first_name
  if (last_name !== undefined) updates.lastName = last_name
  if (phone !== undefined) updates.phone = phone
  if (preferred_area !== undefined) updates.preferredArea = preferred_area

  if (Object.keys(updates).length === 0) {
    const rows = await tx.select().from(players).where(eq(players.id, user.playerId)).limit(1)
    return NextResponse.json({ data: { player: rows[0] } })
  }

  const updated = await tx
    .update(players)
    .set(updates)
    .where(eq(players.id, user.playerId))
    .returning()

  return NextResponse.json({ data: { player: updated[0] } })
})
