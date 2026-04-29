import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { withPlayer } from '@/shared/middleware/with-player'
import { players } from '@/shared/db/schema'

export const dynamic = 'force-dynamic'

export const GET = withPlayer(async (_req, user, tx) => {
  const rows = await tx
    .select()
    .from(players)
    .where(eq(players.id, user.playerId))
    .limit(1)

  if (!rows[0]) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
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
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Datos inválidos' } },
      { status: 422 },
    )
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
