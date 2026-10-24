import { z } from 'zod'

/**
 * Plataforma de Kapso: clientes, links de conexión y números. Es lo que permite
 * que el dueño conecte su WhatsApp desde Ajustes (coexistencia) sin que nadie
 * cargue filas a mano. El envío de mensajes vive en `client.ts` (otra API).
 *
 * Cada respuesta se valida con zod: un cambio de forma de Kapso tiene que
 * romper acá, con un error claro, y no más adentro con un `undefined`.
 */

const KAPSO_PLATFORM_URL = 'https://api.kapso.ai/platform/v1'
const TIMEOUT_MS = 10_000

export class KapsoPlatformError extends Error {
  constructor(
    /** 0 = sin llamada (no configurado), timeout o respuesta ilegible. */
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'KapsoPlatformError'
  }
}

const customerSchema = z
  .object({ id: z.string().min(1), external_customer_id: z.string().nullish() })
  .loose()

const phoneNumberSchema = z
  .object({
    id: z.string().min(1),
    business_account_id: z.string().nullish(),
    customer_id: z.string().nullish(),
    display_phone_number: z.string().nullish(),
    is_coexistence: z.boolean().nullish(),
  })
  .loose()

const webhookSchema = z.object({ url: z.string().nullish() }).loose()

const healthCheckSchema = z
  .object({
    passed: z.boolean().nullish(),
    overall_status: z.string().nullish(),
    details: z
      .object({ status: z.string().nullish(), can_send_message: z.string().nullish() })
      .loose()
      .nullish(),
  })
  .loose()

// Sin el envoltorio `data` del resto de la plataforma: así lo documenta Kapso.
const healthSchema = z
  .object({
    status: z.enum(['healthy', 'degraded', 'unhealthy', 'error']),
    checks: z.record(z.string(), healthCheckSchema).nullish(),
  })
  .loose()

export type KapsoNumberHealth = {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'error'
  /** `CONNECTED` / `DISCONNECTED` / `UNKNOWN` según Meta; null si no vino el check. */
  connection: string | null
  /** `AVAILABLE` / `LIMITED` / `BLOCKED`; null si no vino el check. */
  messaging: string | null
  /** false: Kapso no pudo leer el número en Meta (token vencido o revocado). */
  accessOk: boolean | null
  /** Nombres de los checks con `passed: false`, para el log. */
  failingChecks: string[]
}

export type KapsoPhoneNumber = {
  phoneNumberId: string
  businessAccountId: string | null
  customerId: string | null
  displayPhoneNumber: string | null
  isCoexistence: boolean
}

function toPhoneNumber(raw: z.infer<typeof phoneNumberSchema>): KapsoPhoneNumber {
  return {
    phoneNumberId: raw.id,
    businessAccountId: raw.business_account_id ?? null,
    customerId: raw.customer_id ?? null,
    displayPhoneNumber: raw.display_phone_number ?? null,
    isCoexistence: raw.is_coexistence === true,
  }
}

/** Una llamada a la plataforma. `null` solo para un 404 cuando el caller lo permite. */
async function kapsoRequest<T>(
  path: string,
  opts: {
    method?: 'GET' | 'POST'
    body?: unknown
    schema: z.ZodType<T>
    nullOn404?: boolean
    /** Valor del body que no puede terminar en un log si Kapso lo devuelve en el error. */
    redact?: string
  },
): Promise<T | null> {
  const apiKey = process.env.KAPSO_API_KEY
  if (!apiKey) throw new KapsoPlatformError(0, 'KAPSO_API_KEY no está configurada')

  let res: Response
  try {
    res = await fetch(`${KAPSO_PLATFORM_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new KapsoPlatformError(
      0,
      `Kapso no respondió: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (res.status === 404 && opts.nullOn404) return null
  if (!res.ok) {
    let detail = await res.text().catch(() => '')
    if (opts.redact) detail = detail.replaceAll(opts.redact, '<redacted>')
    detail = detail.slice(0, 300)
    throw new KapsoPlatformError(res.status, `Kapso respondió ${res.status}: ${detail}`)
  }

  const parsed = opts.schema.safeParse(await res.json().catch(() => null))
  if (!parsed.success) throw new KapsoPlatformError(res.status, 'Respuesta de Kapso inesperada')
  return parsed.data
}

async function call<T>(
  path: string,
  opts: { method?: 'GET' | 'POST'; body?: unknown; schema: z.ZodType<T>; redact?: string },
): Promise<T> {
  // Sin `nullOn404` la función nunca devuelve null.
  return (await kapsoRequest(path, opts)) as T
}

/**
 * El cliente de Kapso de un complejo (id externo = id del tenant), o null si no
 * existe. Se vuelve a comparar el id externo acá: si Kapso ignorara el filtro,
 * `data[0]` sería el cliente de otro complejo, y toda la verificación de
 * "el número es tuyo" compararía contra él.
 */
export async function findKapsoCustomer(externalId: string): Promise<{ id: string } | null> {
  const { data } = await call(`/customers?external_customer_id=${encodeURIComponent(externalId)}`, {
    schema: z.object({ data: z.array(customerSchema) }).loose(),
  })
  const mine = data.find((c) => c.external_customer_id === externalId)
  return mine ? { id: mine.id } : null
}

export async function findOrCreateKapsoCustomer(params: {
  externalId: string
  name: string
}): Promise<{ id: string }> {
  const existing = await findKapsoCustomer(params.externalId)
  if (existing) return existing
  const { data } = await call('/customers', {
    method: 'POST',
    body: { customer: { name: params.name, external_customer_id: params.externalId } },
    schema: z.object({ data: customerSchema }).loose(),
  })
  return { id: data.id }
}

/**
 * Link de un solo uso para que el dueño conecte su número. Crear uno revoca el
 * anterior. Con `reconnectPhoneNumber` el link refresca la conexión que Kapso ya
 * tiene de ese número en vez de crear otra, y Meta solo deja elegir ese número.
 */
export async function createKapsoSetupLink(
  customerId: string,
  urls: { successUrl: string; failureUrl: string; reconnectPhoneNumber?: string },
): Promise<{ url: string }> {
  const { data } = await call(`/customers/${encodeURIComponent(customerId)}/setup_links`, {
    method: 'POST',
    body: {
      setup_link: {
        allowed_connection_types: ['coexistence'],
        meta_billing_mode: 'partner_managed',
        language: 'es',
        success_redirect_url: urls.successUrl,
        failure_redirect_url: urls.failureUrl,
        ...(urls.reconnectPhoneNumber && { reconnect_phone_number: urls.reconnectPhoneNumber }),
      },
    },
    schema: z.object({ data: z.object({ url: z.url() }).loose() }).loose(),
  })
  // La url va directo a un redirect(): solo https y dominio de Kapso.
  const { protocol, hostname } = new URL(data.url)
  if (protocol !== 'https:' || !(hostname === 'kapso.ai' || hostname.endsWith('.kapso.ai'))) {
    throw new KapsoPlatformError(201, 'Kapso devolvió un link de conexión fuera de su dominio')
  }
  return { url: data.url }
}

/** El número, o null si Kapso no lo conoce. */
export async function getKapsoPhoneNumber(phoneNumberId: string): Promise<KapsoPhoneNumber | null> {
  const res = await kapsoRequest(`/whatsapp/phone_numbers/${encodeURIComponent(phoneNumberId)}`, {
    schema: z.object({ data: phoneNumberSchema }).loose(),
    nullOn404: true,
  })
  return res ? toPhoneNumber(res.data) : null
}

/**
 * Salud del número según Meta y Kapso, o null si Kapso ya no lo tiene. Kapso
 * cachea la respuesta 3 min por número y limita a 5 por segundo y 60 por
 * minuto por proyecto (un 429 llega sin llamar a Meta).
 */
export async function getKapsoPhoneNumberHealth(
  phoneNumberId: string,
): Promise<KapsoNumberHealth | null> {
  const res = await kapsoRequest(
    `/whatsapp/phone_numbers/${encodeURIComponent(phoneNumberId)}/health`,
    { schema: healthSchema, nullOn404: true },
  )
  if (!res) return null
  const checks = res.checks ?? {}
  return {
    status: res.status,
    connection: checks.phone_number_connection?.details?.status ?? null,
    messaging:
      checks.messaging_health?.overall_status ??
      checks.messaging_health?.details?.can_send_message ??
      null,
    accessOk: checks.phone_number_access?.passed ?? null,
    failingChecks: Object.entries(checks)
      .filter(([, c]) => c.passed === false)
      .map(([name]) => name),
  }
}

export async function listKapsoPhoneNumbers(customerId: string): Promise<KapsoPhoneNumber[]> {
  const { data } = await call(
    `/whatsapp/phone_numbers?customer_id=${encodeURIComponent(customerId)}`,
    {
      schema: z.object({ data: z.array(phoneNumberSchema) }).loose(),
    },
  )
  // Mismo criterio que findKapsoCustomer: no confiar solo en el filtro del servidor.
  return data.map(toPhoneNumber).filter((n) => n.customerId === customerId)
}

function numberWebhooksPath(phoneNumberId: string): string {
  return `/whatsapp/phone_numbers/${encodeURIComponent(phoneNumberId)}/webhooks`
}

/** ¿El número tiene un webhook con esa URL? */
export async function hasKapsoMessageWebhook(params: {
  phoneNumberId: string
  url: string
}): Promise<boolean> {
  // La lista del número (no la del proyecto entero, que crece con cada complejo y pagina).
  const { data } = await call(numberWebhooksPath(params.phoneNumberId), {
    schema: z.object({ data: z.array(webhookSchema) }).loose(),
  })
  return data.some((w) => w.url === params.url)
}

/**
 * Suscribe nuestro webhook a los mensajes del número (`received` y `sent`: el
 * `sent` trae lo que el dueño contesta desde su celular). Idempotente: si ya hay
 * uno con esa URL para ese número, no crea otro.
 */
export async function ensureKapsoMessageWebhook(params: {
  phoneNumberId: string
  url: string
  secret: string
}): Promise<void> {
  if (await hasKapsoMessageWebhook(params)) return

  await call(numberWebhooksPath(params.phoneNumberId), {
    redact: params.secret,
    method: 'POST',
    body: {
      whatsapp_webhook: {
        url: params.url,
        secret_key: params.secret,
        kind: 'kapso',
        payload_version: 'v2',
        events: ['whatsapp.message.received', 'whatsapp.message.sent'],
        active: true,
      },
    },
    schema: z.object({}).loose(),
  })
}
