import type { ReactNode } from 'react'
import { relativeTimeEs } from '@/lib/format'
import { TONE_TEXT } from '@/lib/status-tone'
import { toWhatsappDigits } from '@/lib/whatsapp'
import type { PlayerDetail } from '@/modules/super-admin/players.service'
import { formatShortDate, formatShortDateTime } from '../../../_components/sa-format'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-sm text-muted-foreground sm:w-44 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
    </div>
  )
}

/** `wa.me` con el normalizador del repo (repone el 9 del móvil argentino); `null` si no es marcable. */
function whatsappHref(phone: string): string | null {
  const digits = toWhatsappDigits(phone)
  return digits ? `https://wa.me/${digits}` : null
}

/**
 * Datos del jugador. Nunca muestra el motivo de un bloqueo (texto libre sobre
 * personas, Ley 25.326) y un jugador anonimizado no muestra contacto.
 */
export function PlayerDataCard({ player, now }: { player: PlayerDetail['player']; now: number }) {
  const anonymized = player.status === 'anonymized'
  const wa = player.phone ? whatsappHref(player.phone) : null

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4 lg:p-5 shadow-xs">
      <h2 className="mb-4 text-base font-semibold text-foreground">Datos</h2>
      {anonymized && (
        <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Datos anonimizados a pedido del jugador (Ley 25.326).
        </p>
      )}
      <dl className="space-y-3">
        {!anonymized && <Row label="Email">{player.email ?? '—'}</Row>}
        {!anonymized && (
          <Row label="Teléfono">
            {player.phone ? (
              wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium tabular-nums underline underline-offset-4 hover:text-primary"
                >
                  {player.phone}
                  <span className="sr-only"> (abre WhatsApp en otra pestaña)</span>
                </a>
              ) : (
                <span className="tabular-nums">{player.phone}</span>
              )
            ) : (
              '—'
            )}
          </Row>
        )}
        <Row label="Alta">{formatShortDateTime(player.createdAt)}</Row>
        <Row label="Último ingreso">
          {player.lastLoginAt
            ? `${formatShortDateTime(player.lastLoginAt)} · ${relativeTimeEs(player.lastLoginAt.toISOString(), now)}`
            : 'Nunca'}
        </Row>
        {!anonymized && (
          <Row label="Términos aceptados">
            {player.agreedToTermsAt
              ? `${formatShortDate(player.agreedToTermsAt)}${player.termsVersion ? ` · versión ${player.termsVersion}` : ''}`
              : '—'}
          </Row>
        )}
        {player.status === 'banned' && (
          <Row label="Bloqueo">
            <span className={`font-medium ${TONE_TEXT.destructive}`}>
              Bloqueado en toda la plataforma{' '}
              {player.banUntil
                ? `hasta ${formatShortDateTime(player.banUntil)}`
                : 'sin fecha de fin'}
            </span>
          </Row>
        )}
      </dl>
    </section>
  )
}
