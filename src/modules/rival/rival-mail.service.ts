import { sql } from 'drizzle-orm'
import { captureException } from '@/lib/sentry'
import { getWorkerDb, type DbTx } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'
import {
  QUEUE_RIVAL_MAIL,
  RIVAL_MAIL_SEND_OPTIONS,
  type RivalMailJobData,
} from '@/shared/jobs/definitions'
import { logger } from '@/shared/lib/logger'
import { artDateOf } from '@/shared/time/art-date'
import { signAlertUnsubToken } from '@/shared/security/rival-alert-token'
import { dispatchEmail, enqueueNotification } from '@/modules/notifications/notification.service'
import { quietHoursReleaseAt } from '@/modules/notifications/push-quiet-hours'
import { appLink } from '@/modules/notifications/templates/app-link'
import type { TemplateName } from '@/modules/notifications/templates'
import { artTimeOf, dayLabel } from './rival-display'

/**
 * Mails de RIVAL (fase 6): solo los 4 que importan. Un rechazo, una baja del plantel o "entraste
 * al partido" NO mandan nada (decisión del dueño: poco mail).
 *
 * Flujo: la acción commitea -> `scheduleRivalMail` (post-commit, nunca lanza) encola un job de
 * pg-boss, diferido a las 08:00 ART si cae en la ventana silenciosa -> `processRivalMailJob`
 * revalida contra la base (el mundo pudo cambiar durante la espera) e inserta la fila de
 * `notifications` en una tx del pool worker -> recién DESPUÉS del commit se llama a
 * `dispatchEmail`. Ningún efecto externo (pg-boss, Resend) corre dentro de una transacción.
 *
 * Se difiere el job que inserta, no el mail: `send-email` es un barrido cada minuto que ignora
 * el job y manda toda fila `queued`, así que una fila insertada de madrugada saldría enseguida.
 */

const ART_TZ = 'America/Argentina/Buenos_Aires'

type Row = Record<string, unknown>
type Insertion = { ids: string[] }

const toRows = (r: unknown): Row[] => r as Row[]

/** "Sábado 24 · 21:00" en hora argentina. */
function whenLabel(startsAt: Date): string {
  return `${dayLabel(artDateOf(startsAt))} · ${artTimeOf(startsAt)}`
}

/** `now` como literal timestamptz, para comparar contra el reloj inyectado y no el de la base. */
const asTs = (d: Date) => sql`${d.toISOString()}::timestamptz`

async function sendJob(job: RivalMailJobData, startAfter: Date | null): Promise<void> {
  const boss = await getBoss()
  await boss.send(QUEUE_RIVAL_MAIL, job, {
    ...RIVAL_MAIL_SEND_OPTIONS,
    ...(startAfter ? { startAfter } : {}),
  })
}

/**
 * Encola el mail DESPUÉS del commit de la acción. Nunca lanza: si pg-boss no está, la acción ya
 * hecha sigue valiendo y el mail se pierde (se avisa a Sentry).
 */
export async function scheduleRivalMail(
  job: RivalMailJobData,
  now: Date = new Date(),
): Promise<void> {
  try {
    await sendJob(job, quietHoursReleaseAt(now, ART_TZ))
  } catch (err) {
    captureException(err, { tags: { module: 'rival-mail', type: job.type } })
  }
}

/**
 * Inserta una notificación una sola vez por (evento, destinatario, ref). pg-boss puede reentregar
 * el job tras un crash; el advisory lock cierra la carrera de dos entregas simultáneas.
 */
async function enqueueOnce(
  tx: DbTx,
  p: {
    tenantId: string
    recipientId: string
    templateName: TemplateName
    event: string
    ref: string
    content: Record<string, unknown>
  },
): Promise<string | null> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${p.event}:${p.recipientId}:${p.ref}`}, 0))`,
  )
  const dup = toRows(
    await tx.execute(sql`
      SELECT 1 FROM notifications
      WHERE trigger_event = ${p.event}
        AND recipient_id = ${p.recipientId}::uuid
        AND content->>'ref' = ${p.ref}
      LIMIT 1
    `),
  )
  if (dup.length > 0) return null
  return enqueueNotification(
    {
      tenantId: p.tenantId,
      recipientType: 'player',
      recipientId: p.recipientId,
      templateName: p.templateName,
      content: { ...p.content, ref: p.ref },
      triggerEvent: p.event,
    },
    tx,
  )
}

async function processJoinRequest(
  tx: DbTx,
  job: Extract<RivalMailJobData, { type: 'join_request' }>,
  now: Date,
): Promise<Insertion> {
  const [r] = toRows(
    await tx.execute(sql`
      SELECT m.tenant_id, m.starts_at, m.organizer_player_id, p.role AS requester_role, t.name AS tenant_name,
             req.first_name AS requester_first_name
      FROM rival_participants p
      JOIN rival_matches m ON m.id = p.match_id
      JOIN tenants t ON t.id = m.tenant_id
      JOIN players req ON req.id = p.player_id
      JOIN players org ON org.id = m.organizer_player_id AND org.status = 'active'
      WHERE p.id = ${job.participantId}::uuid
        AND p.match_id = ${job.matchId}::uuid
        AND p.status = 'requested'
        AND m.status = 'open'
        AND m.hidden_at IS NULL
        AND m.starts_at > ${asTs(now)}
        AND (m.seeking IS DISTINCT FROM 'players' OR m.confirmed_count < m.capacity)
    `),
  )
  if (!r) return { ids: [] }
  const id = await enqueueOnce(tx, {
    tenantId: String(r.tenant_id),
    recipientId: String(r.organizer_player_id),
    templateName: 'rival_join_request',
    event: 'rival_join_request',
    ref: job.participantId,
    content: {
      requesterFirstName: String(r.requester_first_name),
      // El rol que fijó el trigger al insertar el pedido: `seeking` puede haber cambiado hasta que despierta el job.
      requesterRole: r.requester_role === 'rival_captain' ? 'captain' : 'player',
      tenantName: String(r.tenant_name),
      dateLabel: whenLabel(new Date(String(r.starts_at))),
      url: appLink(`/rival/partido/${job.matchId}`),
    },
  })
  return { ids: id ? [id] : [] }
}

async function processAccepted(
  tx: DbTx,
  job: Extract<RivalMailJobData, { type: 'accepted' }>,
  now: Date,
): Promise<Insertion> {
  const [r] = toRows(
    await tx.execute(sql`
      SELECT m.tenant_id, m.starts_at, p.player_id, t.name AS tenant_name
      FROM rival_participants p
      JOIN rival_matches m ON m.id = p.match_id
      JOIN tenants t ON t.id = m.tenant_id
      JOIN players pl ON pl.id = p.player_id AND pl.status = 'active'
      WHERE p.id = ${job.participantId}::uuid
        AND p.match_id = ${job.matchId}::uuid
        AND p.status = 'confirmed'
        AND p.origin = 'board'
        AND m.status = 'open'
        AND m.hidden_at IS NULL
        AND m.starts_at > ${asTs(now)}
    `),
  )
  if (!r) return { ids: [] }
  // El link va a la pantalla del partido: el wa.me se arma del lado del servidor ahí, nunca en el mail.
  const id = await enqueueOnce(tx, {
    tenantId: String(r.tenant_id),
    recipientId: String(r.player_id),
    templateName: 'rival_accepted',
    event: 'rival_accepted',
    ref: job.participantId,
    content: {
      tenantName: String(r.tenant_name),
      dateLabel: whenLabel(new Date(String(r.starts_at))),
      url: appLink(`/rival/partido/${job.matchId}`),
    },
  })
  return { ids: id ? [id] : [] }
}

async function processCanceled(
  tx: DbTx,
  job: Extract<RivalMailJobData, { type: 'canceled' }>,
  now: Date,
): Promise<Insertion> {
  const [m] = toRows(
    await tx.execute(sql`
      SELECT m.tenant_id, m.starts_at, m.organizer_player_id, t.name AS tenant_name
      FROM rival_matches m
      JOIN tenants t ON t.id = m.tenant_id
      WHERE m.id = ${job.matchId}::uuid
        AND m.status = 'canceled'
        AND m.starts_at > ${asTs(now)}
    `),
  )
  if (!m) return { ids: [] }
  // Cancelar no toca el plantel (099): confirmados y banco siguen así. Se resuelven al despertar.
  const recipients = toRows(
    await tx.execute(sql`
      SELECT p.player_id
      FROM rival_participants p
      JOIN players pl ON pl.id = p.player_id AND pl.status = 'active'
      WHERE p.match_id = ${job.matchId}::uuid
        AND p.status IN ('confirmed', 'bench')
        AND p.player_id <> ${String(m.organizer_player_id)}::uuid
      ORDER BY p.player_id
    `),
  )
  const ids: string[] = []
  for (const rec of recipients) {
    const id = await enqueueOnce(tx, {
      tenantId: String(m.tenant_id),
      recipientId: String(rec.player_id),
      templateName: 'rival_canceled',
      event: 'rival_canceled',
      ref: job.matchId,
      content: {
        tenantName: String(m.tenant_name),
        dateLabel: whenLabel(new Date(String(m.starts_at))),
        url: appLink('/rival'),
      },
    })
    if (id) ids.push(id)
  }
  return { ids }
}

async function processAlertPublish(
  tx: DbTx,
  job: Extract<RivalMailJobData, { type: 'alert_publish' }>,
  now: Date,
): Promise<Insertion> {
  // Sigue abierto, publicado, visible y con el organizador activo, y todavía le faltan jugadores.
  // Busca-rival no genera alerta (spec §9: la alerta es para quien falta gente o arquero).
  const [m] = toRows(
    await tx.execute(sql`
      SELECT m.tenant_id, m.starts_at, m.organizer_player_id, m.seeking_position,
             t.name AS tenant_name
      FROM rival_matches m
      JOIN tenants t ON t.id = m.tenant_id
      JOIN players org ON org.id = m.organizer_player_id AND org.status = 'active'
      WHERE m.id = ${job.matchId}::uuid
        AND m.status = 'open'
        AND m.on_board
        AND m.hidden_at IS NULL
        AND m.starts_at > ${asTs(now)}
        AND m.seeking = 'players'
        AND m.confirmed_count < m.capacity
    `),
  )
  if (!m) return { ids: [] }
  const tenantId = String(m.tenant_id)

  // Ban: el global (`players.status`) lo corta el JOIN; del complejo cuenta solo el MANUAL vigente
  // (`banned_by IS NOT NULL`), igual que `rival_is_banned` de la 099 (esa función no está
  // otorgada al rol worker, por eso se repite la condición).
  const recipients = toRows(
    await tx.execute(sql`
      SELECT s.player_id
      FROM rival_alert_subscriptions s
      JOIN players pl ON pl.id = s.player_id AND pl.status = 'active'
      WHERE s.tenant_id = ${tenantId}::uuid
        AND s.player_id <> ${String(m.organizer_player_id)}::uuid
        AND (NOT s.only_goalkeeper OR ${m.seeking_position == null ? null : String(m.seeking_position)}::text = 'goalkeeper')
        AND NOT EXISTS (
          SELECT 1 FROM rival_participants rp
          WHERE rp.match_id = ${job.matchId}::uuid AND rp.player_id = s.player_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM tenant_player_bans b
          WHERE b.tenant_id = s.tenant_id AND b.player_id = s.player_id
            AND b.banned_by IS NOT NULL
            AND (b.banned_until IS NULL OR b.banned_until > now())
        )
      ORDER BY s.player_id
    `),
  )

  const sentOn = artDateOf(now)
  const dateLabel = whenLabel(new Date(String(m.starts_at)))
  const ids: string[] = []
  for (const rec of recipients) {
    const playerId = String(rec.player_id)
    // La barrera contra el duplicado es la unique de `rival_alert_sends` (una por partido+jugador
    // y una por día+jugador), no un SELECT previo: sin target el ON CONFLICT cubre las dos. El claim
    // y la fila de `notifications` van en la misma tx, así que un fallo en el medio revierte ambos
    // y el reintento de pg-boss no pierde la alerta.
    const claim = toRows(
      await tx.execute(sql`
        INSERT INTO rival_alert_sends (match_id, player_id, sent_on)
        VALUES (${job.matchId}::uuid, ${playerId}::uuid, ${sentOn}::date)
        ON CONFLICT DO NOTHING
        RETURNING id
      `),
    )
    if (claim.length === 0) continue
    const id = await enqueueNotification(
      {
        tenantId,
        recipientType: 'player',
        recipientId: playerId,
        templateName: 'rival_alert',
        triggerEvent: 'rival_alert_publish',
        content: {
          ref: job.matchId,
          tenantName: String(m.tenant_name),
          dateLabel,
          url: appLink(`/rival/partido/${job.matchId}`),
          unsubscribeUrl: appLink(`/rival/baja?t=${signAlertUnsubToken({ playerId, tenantId })}`),
        },
      },
      tx,
    )
    ids.push(id)
  }
  return { ids }
}

/**
 * Lo que hace el worker `rival-mail` al despertar. `now` se inyecta para poder probar la ventana
 * sin tocar el reloj. Lanza solo ante fallas de infraestructura (pg-boss reintenta); que el mundo
 * haya cambiado (partido cancelado, pedido retirado…) NO es un error: simplemente no manda nada.
 */
export async function processRivalMailJob(
  job: RivalMailJobData,
  now: Date = new Date(),
): Promise<void> {
  // Defensa de ventana: despertó antes de tiempo o un reintento cayó de madrugada. Se re-difiere
  // sin insertar nada.
  const release = quietHoursReleaseAt(now, ART_TZ)
  if (release) {
    await sendJob(job, release)
    return
  }

  const { ids } = await getWorkerDb().transaction(async (tx) => {
    switch (job.type) {
      case 'join_request':
        return processJoinRequest(tx, job, now)
      case 'accepted':
        return processAccepted(tx, job, now)
      case 'canceled':
        return processCanceled(tx, job, now)
      case 'alert_publish':
        return processAlertPublish(tx, job, now)
    }
  })

  // Después del commit. Si el dispatch falla la fila queda `queued` y la agarra el barrido de
  // `send-email`, así que no se relanza el job (reinsertaría).
  for (const id of ids) {
    try {
      await dispatchEmail(id)
    } catch (err) {
      logger.warn('rival-mail: dispatchEmail falló, queda para el barrido', {
        module: 'rival-mail',
        notificationId: id,
      })
      captureException(err, { tags: { module: 'rival-mail', type: job.type } })
    }
  }
}
