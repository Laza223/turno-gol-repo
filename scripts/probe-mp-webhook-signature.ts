/**
 * Sonda de FIRMA del webhook de MercadoPago, contra producción y sin efectos.
 *
 * Por qué existe: el simulador del panel de MP no sirve para verificar la clave.
 * Manda la notificación a la URL configurada ahí, que NO lleva `?tenant=` — y el
 * route handler corta con 400 ("missing tenant") **antes** de mirar la firma. En
 * producción el `?tenant=` lo agrega TurnoGol por operación, en la
 * `notification_url` de cada preferencia. Medido el 2026-08-18:
 *
 *   POST sin ?tenant                      -> 400
 *   POST con ?tenant y firma inválida     -> 401
 *
 * Esta sonda manda un `type` que el handler NO maneja. Eso importa: el orden del
 * route es tenant -> json -> schema -> FIRMA -> tipo, así que un tipo desconocido
 * se responde `{ok:true, ignored}` DESPUÉS de validar la firma. Resultado: la
 * sonda distingue 401 de 200 sin encolar ningún job ni tocar un solo pago.
 *
 *   200 -> la clave de Vercel coincide con la de MercadoPago
 *   401 -> no coinciden (o falta la variable en el entorno del deploy)
 *
 * La clave nunca sale de la máquina de quien corre esto: se lee del entorno y
 * solo se manda el HMAC.
 *
 * Uso (PowerShell, que es la shell de esta máquina — `VAR=valor cmd` NO funciona ahí):
 *   $env:MP_WEBHOOK_SECRET="<clave>"; pnpm tsx scripts/probe-mp-webhook-signature.ts <tenantId>
 *
 * Uso (bash/zsh):
 *   MP_WEBHOOK_SECRET="<clave>" pnpm tsx scripts/probe-mp-webhook-signature.ts <tenantId> [baseUrl]
 */
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

// `MP_WEBHOOK_SECRET_FILE` evita tener que pegar la clave en la línea de
// comandos (queda en el historial de la shell). El archivo se lee y se descarta.
const secretFile = process.env.MP_WEBHOOK_SECRET_FILE
const secret = secretFile ? readFileSync(secretFile, 'utf8').trim() : process.env.MP_WEBHOOK_SECRET
const tenantId = process.argv[2]
const baseUrl = process.argv[3] ?? 'https://turnogol.app'

if (!secret) {
  console.error('Falta MP_WEBHOOK_SECRET en el entorno.')
  console.error(
    'PowerShell:  $env:MP_WEBHOOK_SECRET="<clave>"; pnpm tsx scripts/probe-mp-webhook-signature.ts <tenantId>',
  )
  console.error(
    'bash/zsh:    MP_WEBHOOK_SECRET="<clave>" pnpm tsx scripts/probe-mp-webhook-signature.ts <tenantId>',
  )
  process.exit(1)
}
if (!tenantId) {
  console.error('Falta el tenantId como primer argumento.')
  process.exit(1)
}

async function main(): Promise<void> {
  // `data.id` tiene que ser numérico: el schema del webhook lo exige (MP_ID_RE).
  // El valor en sí da igual — con un tipo no manejado nadie lo va a buscar.
  const dataId = '1234567890'
  const requestId = 'sonda-firma-turnogol'
  const ts = String(Math.floor(Date.now() / 1000))

  // Mismo manifest que `verifyWebhookSignature`, con data.id en minúsculas.
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', secret!).update(manifest).digest('hex')

  const url = `${baseUrl}/api/webhooks/mercadopago?tenant=${encodeURIComponent(tenantId!)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': `ts=${ts},v1=${v1}`,
      'x-request-id': requestId,
    },
    // Tipo deliberadamente NO manejado: se responde después de validar la firma.
    body: JSON.stringify({
      id: 1,
      type: 'sonda_de_firma',
      data: { id: dataId },
    }),
  })

  const body = await res.text()
  console.log(`HTTP ${res.status} — ${body}`)
  console.log('')
  if (res.status === 200) {
    console.log('OK: la clave del deploy coincide con la que firmó esta sonda.')
  } else if (res.status === 401) {
    console.log('FIRMA RECHAZADA: la clave del deploy NO es la que acabás de usar.')
    console.log('Revisá que la variable esté en el entorno Production y que hayas redeployado.')
  } else {
    console.log('Respuesta inesperada — no llegó al chequeo de firma.')
  }
}

void main()
