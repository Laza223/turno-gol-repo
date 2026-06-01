import { captureMessage } from '@/lib/sentry'

/**
 * Handler for browser Content-Security-Policy violation reports.
 *
 * Wired to /api/csp-report via `report-uri` (legacy) and `report-to` /
 * `Reporting-Endpoints` (modern Reporting API) — see next.config.js. The body
 * is attacker-controllable (any client can POST here, unauthenticated), so the
 * handler is defensive:
 *
 *   - caps the payload size (CSP reports are tiny),
 *   - never throws / never reflects input — always answers 204,
 *   - dedupes by (directive, blockedUri) so a single broken directive firing on
 *     every page load can't flood Sentry, mirroring the rate-limiter alerting,
 *   - bounds the dedupe map so a flood of *distinct* keys can't grow memory
 *     unbounded.
 */

/** CSP reports are a few hundred bytes; anything larger is abuse. */
const MAX_BODY_BYTES = 8 * 1024

/** One Sentry event per (directive, blockedUri) per window. */
const ALERT_COOLDOWN_MS = 60_000

/** Hard ceiling on tracked keys; cleared wholesale when exceeded. */
const MAX_DEDUPE_KEYS = 500

const lastAlertAt = new Map<string, number>()

/** Test-only: clears the dedupe state between cases. */
export function __resetCspReportDedupeForTests(): void {
  lastAlertAt.clear()
}

interface NormalizedViolation {
  documentUri: string
  violatedDirective: string
  effectiveDirective: string
  blockedUri: string
  sourceFile?: string
  lineNumber?: number
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

/** Legacy `report-uri` body: `{ "csp-report": { "blocked-uri": ... } }`. */
function fromLegacy(report: Record<string, unknown>): NormalizedViolation {
  const violated = str(report['violated-directive'])
  const effective = str(report['effective-directive']) || violated
  return {
    documentUri: str(report['document-uri']),
    violatedDirective: violated || effective,
    effectiveDirective: effective || violated,
    blockedUri: str(report['blocked-uri']),
    sourceFile: str(report['source-file']) || undefined,
    lineNumber: num(report['line-number']),
  }
}

/** Modern Reporting API body: `{ blockedURL, effectiveDirective, ... }`. */
function fromModern(body: Record<string, unknown>): NormalizedViolation {
  const effective = str(body.effectiveDirective)
  const violated = str(body.violatedDirective) || effective
  return {
    documentUri: str(body.documentURL),
    violatedDirective: violated || effective,
    effectiveDirective: effective || violated,
    blockedUri: str(body.blockedURL),
    sourceFile: str(body.sourceFile) || undefined,
    lineNumber: num(body.lineNumber),
  }
}

/** Extract zero or more violations from a parsed payload, tolerating shape drift. */
function extractViolations(parsed: unknown): NormalizedViolation[] {
  // Modern Reporting API: an array of { type, body }.
  if (Array.isArray(parsed)) {
    return parsed
      .filter(
        (r): r is { body: Record<string, unknown> } =>
          !!r &&
          typeof r === 'object' &&
          (r as { type?: unknown }).type === 'csp-violation' &&
          typeof (r as { body?: unknown }).body === 'object' &&
          (r as { body?: unknown }).body !== null,
      )
      .map((r) => fromModern(r.body))
  }

  // Legacy report-uri: { "csp-report": {...} }.
  if (parsed && typeof parsed === 'object') {
    const legacy = (parsed as { 'csp-report'?: unknown })['csp-report']
    if (legacy && typeof legacy === 'object') {
      return [fromLegacy(legacy as Record<string, unknown>)]
    }
  }

  return []
}

function reportToSentry(v: NormalizedViolation): void {
  const directive = v.effectiveDirective || v.violatedDirective || 'unknown'
  const blocked = v.blockedUri || 'inline'

  const key = `${directive}|${blocked}`
  const now = Date.now()
  const last = lastAlertAt.get(key) ?? 0
  if (now - last < ALERT_COOLDOWN_MS) return
  if (lastAlertAt.size >= MAX_DEDUPE_KEYS) lastAlertAt.clear()
  lastAlertAt.set(key, now)

  // Alerting must never break the response — swallow anything Sentry throws.
  try {
    captureMessage(`CSP violation: ${directive} blocked ${blocked}`, {
      level: 'warning',
      extra: {
        violatedDirective: v.violatedDirective,
        effectiveDirective: v.effectiveDirective,
        blockedUri: v.blockedUri,
        documentUri: v.documentUri,
        sourceFile: v.sourceFile,
        lineNumber: v.lineNumber,
      },
    })
  } catch {
    /* noop */
  }
}

const noContent = (): Response => new Response(null, { status: 204 })

/**
 * Parse a CSP violation report and forward it to Sentry. Always resolves to a
 * 204 — invalid, oversized or empty bodies are dropped silently.
 */
export async function handleCspReport(req: Request): Promise<Response> {
  // Cheap pre-check on the advertised size before reading anything.
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return noContent()
  }

  let raw: string
  try {
    raw = await req.text()
  } catch {
    return noContent()
  }

  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return noContent()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return noContent()
  }

  for (const violation of extractViolations(parsed)) {
    reportToSentry(violation)
  }

  return noContent()
}
