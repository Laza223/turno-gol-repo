/**
 * Sonda de PERMISOS del token OAuth de un complejo, contra la API real de
 * MercadoPago y **sin mover un peso**.
 *
 * Por qué existe: durante la migración a dos aplicaciones de MercadoPago
 * (2026-08-22, `docs/planning/2026-08-22-dos-apps-mercadopago.md`) nos apoyamos
 * en el `scope` que devuelve el intercambio OAuth para decidir si una
 * aplicación podía reembolsar. Ese string resultó ser mala evidencia: la app de
 * Checkout Pro no lista NINGÚN permiso de `payments` —ni de lectura— y sin
 * embargo toda integración Checkout Pro consulta `/v1/payments/{id}` después
 * del webhook. O el listado de URNs no es autoritativo, o el producto sería
 * inservible. Adivinar cuál cuesta un ciclo entero de 15 minutos: crear la app,
 * configurarle webhooks, cambiar variables en Vercel y Railway, redeployar y
 * reconectar un complejo.
 *
 * Esta sonda reemplaza ese ciclo por un comando. Le pregunta a MercadoPago
 * directamente "¿este token puede X?" y se cree la respuesta de la API, no la
 * del `scope`.
 *
 * ── Por qué no mueve plata ──────────────────────────────────────────────────
 *
 * Las sondas de reembolso hacen un POST real a `/v1/payments/{id}/refunds` y a
 * `/v1/orders/{id}/refund`, pero contra un id INEXISTENTE. El chequeo de
 * permisos de MercadoPago corre en su gateway, ANTES de buscar el recurso — eso
 * es exactamente lo que significa el `403 At least one policy returned
 * UNAUTHORIZED` que motivó todo esto. Así que el código de respuesta separa las
 * dos hipótesis sin que exista un pago al que devolverle nada:
 *
 *   403  -> el token NO tiene permiso de reembolso  (falla la policy)
 *   404  -> el token SÍ tiene permiso               (pasa la policy, no hay recurso)
 *
 * Se sondean las DOS vías porque la app de Checkout Pro no recibe ningún
 * `urn:mp:online:payments*` pero sí `urn:mp:online:order:payment/read-write`:
 * la hipótesis es que a esas apps MercadoPago las movió a la API de Orders y
 * dejó el endpoint legacy detrás del scope viejo.
 *
 * El id que se manda es de 12 dígitos y no pertenece al vendedor; aunque
 * existiera en MercadoPago, un reembolso sobre un pago ajeno da 404, nunca una
 * devolución. Igual se puede pisar con `--refund-probe-id=<id>` si algún día
 * hace falta apuntar a uno propio.
 *
 * ── Uso ─────────────────────────────────────────────────────────────────────
 *
 * Por slug — exige DSN de producción válido y la `ENCRYPTION_KEY` de producción
 * en el env (el token está cifrado at-rest), igual que `inspect-mp-payment.ts`:
 *
 *   pnpm tsx scripts/probe-mp-permissions.ts complejo-elite-futbol
 *
 * Con un token EN CLARO — sin base ni clave, la vía corta. Es la que sirve para
 * el Access Token de producción que el panel de MercadoPago muestra de una
 * aplicación (ver la nota de `tokenPlano` sobre qué responde y qué no):
 *
 *   PowerShell:  $env:MP_ACCESS_TOKEN_FILE="token.txt"; pnpm tsx scripts/probe-mp-permissions.ts
 *   bash/zsh:    MP_ACCESS_TOKEN_FILE=token.txt pnpm tsx scripts/probe-mp-permissions.ts
 *
 * Con el ciphertext a mano (base inaccesible pero clave disponible):
 *
 *   MP_TOKEN_CIPHERTEXT_FILE=token.txt pnpm tsx scripts/probe-mp-permissions.ts
 */
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

function loadEnvFile(path: string): void {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    console.error(`No pude leer ${path}`)
    process.exit(1)
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (!m) continue
    const [, key, valRaw] = m
    if (process.env[key]) continue
    process.env[key] = valRaw.replace(/^["']|["']$/g, '')
  }
}

loadEnvFile(process.env.MP_ENV_FILE ?? '.env.production')

const args = process.argv.slice(2)
const slug = args.find((a) => !a.startsWith('--'))
const refundProbeId =
  args.find((a) => a.startsWith('--refund-probe-id='))?.split('=')[1] ?? '999999999999'

/**
 * Token EN CLARO, la vía sin base de datos ni `ENCRYPTION_KEY`.
 *
 * Existe porque la vía por slug exige tres cosas que en la práctica fallan
 * juntas: DSN de producción válido en el `.env.production` local (que no es
 * foto de prod y suele tener la password rotada — pasó el 2026-08-22, error
 * `28P01`), la `ENCRYPTION_KEY` de producción, y que ambas coincidan. Con el
 * token en claro no hace falta nada de eso: sirve para pegar el Access Token
 * de producción que el panel de MercadoPago muestra de una aplicación.
 *
 * OJO con la interpretación: ese token es la credencial de la aplicación sobre
 * la cuenta de SU DUEÑO, no el token OAuth que un vendedor tercero le emite.
 * Responde "¿esta aplicación puede reembolsar?", que no es exactamente
 * "¿puede reembolsar en nombre de un tercero?". Sirve para decidir el paso
 * siguiente, no para dar por cerrado el caso.
 *
 * Se lee de un ARCHIVO y no de la línea de comandos para que no quede en el
 * historial de la shell.
 */
const tokenFile = process.env.MP_ACCESS_TOKEN_FILE

/**
 * `MP_ACCESS_TOKEN_FILE` espera un NOMBRE DE ARCHIVO, pero pegar el token ahí
 * directamente es el error obvio de cometer —pasó a la primera— y el crudo
 * `ENOENT: no such file or directory, open 'APP_USR-…'` no ayuda a entenderlo:
 * parece un problema de rutas cuando en realidad el valor era correcto y el
 * sobre estaba equivocado. Como los tokens de MercadoPago tienen prefijo
 * conocido y ningún archivo se llama así, se acepta el valor tal cual y se
 * avisa, en vez de morir con un stack trace.
 */
function leerToken(valor: string): string {
  if (/^(APP_USR|TEST)-/.test(valor)) {
    console.warn(
      'Aviso: MP_ACCESS_TOKEN_FILE traía el token en vez de un nombre de archivo. Lo uso igual.',
    )
    return valor.trim()
  }
  return readFileSync(valor, 'utf8').trim()
}

const tokenPlano = tokenFile ? leerToken(tokenFile) : process.env.MP_ACCESS_TOKEN

if (
  !slug &&
  !tokenPlano &&
  !process.env.MP_TOKEN_CIPHERTEXT &&
  !process.env.MP_TOKEN_CIPHERTEXT_FILE
) {
  console.error('Uso: pnpm tsx scripts/probe-mp-permissions.ts <slug-del-complejo>')
  console.error('')
  console.error('Sin base de datos ni ENCRYPTION_KEY, con un token en claro:')
  console.error(
    '  PowerShell:  $env:MP_ACCESS_TOKEN_FILE="token.txt"; pnpm tsx scripts/probe-mp-permissions.ts',
  )
  console.error(
    '  bash/zsh:    MP_ACCESS_TOKEN_FILE=token.txt pnpm tsx scripts/probe-mp-permissions.ts',
  )
  process.exit(1)
}

type Sonda = {
  nombre: string
  detalle: string
  status: number
  veredicto: string
  cuerpo: string
}

const MP = 'https://api.mercadopago.com'

/** Recorta el cuerpo: alcanza con el `error`/`message` para diagnosticar. */
function recortar(texto: string): string {
  return texto.replace(/\s+/g, ' ').slice(0, 220)
}

async function sondear(
  nombre: string,
  detalle: string,
  init: { url: string; method?: string; token: string; body?: unknown },
  interpretar: (status: number) => string,
): Promise<Sonda> {
  const res = await fetch(init.url, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${init.token}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      // Obligatoria en los POST de reembolso; un UUID nuevo por corrida para
      // que MercadoPago no colapse dos sondas distintas en la misma operación.
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const cuerpo = recortar(await res.text().catch(() => ''))
  return { nombre, detalle, status: res.status, veredicto: interpretar(res.status), cuerpo }
}

async function main(): Promise<void> {
  let tenantId: string | null = null
  let sql: ReturnType<typeof postgres> | null = null
  let accessToken: string

  if (tokenPlano) {
    // Camino corto: el token ya viene en claro, no hay base ni descifrado.
    accessToken = tokenPlano
    console.log('token en claro (no se consultó la base)')
  } else {
    const { decrypt } = await import('../src/lib/crypto/encrypt')

    const ctFile = process.env.MP_TOKEN_CIPHERTEXT_FILE
    const ctFromEnv = ctFile ? readFileSync(ctFile, 'utf8').trim() : process.env.MP_TOKEN_CIPHERTEXT

    let cipher: string
    if (ctFromEnv) {
      cipher = ctFromEnv
    } else {
      try {
        sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
        const rows = await sql<{ id: string; name: string; token: string | null }[]>`
          SELECT id, name, mp_access_token AS token FROM tenants WHERE slug = ${slug!} LIMIT 1
        `
        const tenant = rows[0]
        if (!tenant?.token) {
          console.error(`El complejo ${slug} no existe o no tiene MercadoPago conectado.`)
          await sql.end()
          process.exit(1)
        }
        cipher = tenant.token
        tenantId = tenant.id
        console.log(`complejo: ${tenant.name} (${tenant.id})`)
      } catch (err) {
        // `28P01` = password rechazada. El `.env.production` del repo NO es foto
        // de producción y su password suele estar rotada; el error crudo de
        // postgres no lo dice y manda a buscar por el lado equivocado.
        const code = (err as { code?: string } | null)?.code
        console.error(
          code === '28P01'
            ? 'No se pudo entrar a la base: la password del DATABASE_URL de este env está vencida.'
            : 'No se pudo consultar la base.',
        )
        console.error('Sin base: pasá el token en claro con MP_ACCESS_TOKEN_FILE=<archivo>.')
        console.error(err instanceof Error ? err.message : String(err))
        if (sql) await sql.end().catch(() => {})
        process.exit(1)
      }
    }

    try {
      accessToken = decrypt(cipher)
    } catch (err) {
      console.error('No se pudo DESCIFRAR el token del complejo.')
      console.error('Eso significa que ENCRYPTION_KEY de este env NO es la de producción.')
      console.error(err instanceof Error ? err.message : String(err))
      if (sql) await sql.end()
      process.exit(1)
    }
  }

  // Un pago propio del complejo, para que la sonda de LECTURA pruebe el caso
  // real (leer un pago que le pertenece) y no un 404 por recurso ajeno.
  let pagoPropio: string | null = null
  if (sql && tenantId) {
    const rows = await sql<{ mp_payment_id: string | null }[]>`
      SELECT mp_payment_id FROM payments
      WHERE tenant_id = ${tenantId} AND mp_payment_id IS NOT NULL AND type <> 'refund'
      ORDER BY created_at DESC LIMIT 1
    `
    pagoPropio = rows[0]?.mp_payment_id ?? null
  }
  if (sql) await sql.end()

  const sondas: Sonda[] = []

  sondas.push(
    await sondear(
      'identidad',
      'GET /users/me',
      { url: `${MP}/users/me`, token: accessToken },
      (s) => (s === 200 ? 'OK — el token es válido y vive' : `INESPERADO (${s})`),
    ),
  )

  if (pagoPropio) {
    sondas.push(
      await sondear(
        'leer pagos',
        `GET /v1/payments/${pagoPropio}`,
        { url: `${MP}/v1/payments/${pagoPropio}`, token: accessToken },
        (s) =>
          s === 200
            ? 'PUEDE LEER pagos'
            : s === 403
              ? 'NO PUEDE LEER pagos — la confirmación de señas NO va a funcionar'
              : `INESPERADO (${s})`,
      ),
    )
  } else {
    console.log('(sin pagos propios en la base: se saltea la sonda de lectura)\n')
  }

  sondas.push(
    await sondear(
      'refund pago',
      `POST /v1/payments/${refundProbeId}/refunds  (pago inexistente — no mueve plata)`,
      {
        url: `${MP}/v1/payments/${refundProbeId}/refunds`,
        method: 'POST',
        token: accessToken,
      },
      (s) =>
        s === 403
          ? 'NO PUEDE REEMBOLSAR (endpoint legacy) — la policy rechaza antes de mirar el recurso'
          : s === 404
            ? 'PUEDE REEMBOLSAR (endpoint legacy) — pasó la policy y sólo falta el recurso'
            : `AMBIGUO (${s}) — leer el cuerpo`,
    ),
  )

  // Segunda vía de reembolso, y la razón de sondearla: la app de Checkout Pro
  // NO recibe ningún `urn:mp:online:payments*` pero SÍ recibe
  // `urn:mp:online:order:payment/read-write` — escritura sobre órdenes. La
  // hipótesis es que MercadoPago movió a esas apps a la API de Orders y dejó el
  // endpoint legacy de pagos detrás del scope viejo. Si esta sonda da 404 y la
  // de arriba 403, ahí está el camino: reembolsar por orden, no por pago.
  //
  // OJO con el paso siguiente si eso pasa: nuestros cobros se crean con
  // Preference (Checkout Pro clásico), que produce un `payment` y un
  // `merchant_order` — falta confirmar que exista un `order_id` de la API nueva
  // al que apuntar. El permiso y el recurso son dos preguntas distintas.
  sondas.push(
    await sondear(
      'refund orden',
      `POST /v1/orders/${refundProbeId}/refund  (orden inexistente — no mueve plata)`,
      {
        url: `${MP}/v1/orders/${refundProbeId}/refund`,
        method: 'POST',
        token: accessToken,
      },
      (s) =>
        s === 403
          ? 'NO PUEDE REEMBOLSAR por Orders'
          : s === 404
            ? 'PUEDE REEMBOLSAR por Orders — pasó la policy y sólo falta el recurso'
            : `AMBIGUO (${s}) — leer el cuerpo`,
    ),
  )

  console.log('\n===== permisos reales del token =====\n')
  for (const s of sondas) {
    console.log(`${s.nombre.padEnd(12)} ${String(s.status).padEnd(4)} ${s.veredicto}`)
    console.log(`             ${s.detalle}`)
    if (s.cuerpo) console.log(`             ${s.cuerpo}`)
    console.log('')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
