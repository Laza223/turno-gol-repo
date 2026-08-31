#!/usr/bin/env node
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import readline from 'readline'

const ACCOUNTS_FILE = path.join(process.cwd(), 'scripts', 'ig-follow', 'accounts.json')
const SESSION_DIR = path.join(process.cwd(), '.ig-session')

// Parámetros configurables por línea de comandos o por defecto
const args = process.argv.slice(2)
function getArg(name, defaultValue) {
  const match = args.find((a) => a.startsWith(`--${name}=`))
  if (match) return match.split('=')[1]
  return defaultValue
}
const isDryRun = args.includes('--dry-run')
const MAX_FOLLOWS_THIS_RUN = parseInt(getArg('limit', '35'), 10) // Máximo seguro por sesión/día
const MIN_DELAY_SEC = parseInt(getArg('min-delay', '25'), 10) // Mínimo delay entre follows (segundos)
const MAX_DELAY_SEC = parseInt(getArg('max-delay', '65'), 10) // Máximo delay entre follows (segundos)
const BATCH_SIZE = parseInt(getArg('batch-size', '10'), 10) // Cada cuántos follows hacer pausa larga
const BATCH_BREAK_SEC = parseInt(getArg('batch-break', '300'), 10) // 5 minutos de descanso por tanda

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function waitForEnter(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise((resolve) => {
    rl.question(promptText, () => {
      rl.close()
      resolve()
    })
  })
}

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    console.error(`❌ No se encontró el archivo: ${ACCOUNTS_FILE}`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'))
}

function saveAccounts(accounts) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8')
}

async function simulateHumanInteraction(page) {
  try {
    const { width, height } = page.viewportSize() || { width: 1280, height: 800 }
    // Movimiento de ratón errático y natural
    for (let i = 0; i < 3; i++) {
      const x = randomBetween(100, width - 100)
      const y = randomBetween(100, height - 100)
      await page.mouse.move(x, y, { steps: randomBetween(8, 20) })
      await sleep(randomBetween(200, 600))
    }
    // Scroll sutil hacia abajo y luego arriba
    await page.mouse.wheel(0, randomBetween(150, 350))
    await sleep(randomBetween(800, 1500))
    await page.mouse.wheel(0, -randomBetween(100, 250))
    await sleep(randomBetween(400, 900))
  } catch {
    // Si falla la interacción visual no bloquea el flujo
  }
}

async function checkForActionBlocked(page) {
  // Selectores comunes de modales de bloqueo / límite de Instagram
  const blockKeywords = [
    'acción bloqueada',
    'action blocked',
    'inténtalo de nuevo más tarde',
    'try again later',
    'restringido',
    'avísanos',
    'tell us',
    'compartir tu cuenta',
  ]

  try {
    const dialogs = await page.locator('div[role="dialog"]').all()
    for (const dialog of dialogs) {
      const text = (await dialog.innerText()).toLowerCase()
      for (const kw of blockKeywords) {
        if (text.includes(kw)) {
          return true
        }
      }
    }
  } catch {
    // ignore
  }
  return false
}

async function countdown(seconds, reason) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r⏳ ${reason} Esperando ${i}s... `)
    await sleep(1000)
  }
  process.stdout.write(`\r${' '.repeat(60)}\r`)
}

async function main() {
  console.log('='.repeat(65))
  console.log('⚽ TURNOGOL - AUTO FOLLOWER CON PLAYWRIGHT')
  console.log('='.repeat(65))
  console.log(`📌 Configuración:`)
  console.log(`   - Límite para esta corrida: ${MAX_FOLLOWS_THIS_RUN} cuentas`)
  console.log(`   - Pausa aleatoria entre perfiles: ${MIN_DELAY_SEC}s - ${MAX_DELAY_SEC}s`)
  console.log(`   - Tanda de descanso: Cada ${BATCH_SIZE} follows -> ${BATCH_BREAK_SEC}s pausa`)
  console.log(
    `   - Modo: ${isDryRun ? '🧪 DRY-RUN (simulación sin clics)' : '🚀 REAL (siguiendo perfiles)'}`,
  )
  console.log('='.repeat(65))

  const accounts = loadAccounts()
  const pending = accounts.filter((a) => a.status === 'pending')
  const alreadyFollowed = accounts.filter((a) => a.status === 'followed').length
  const alreadyFollowing = accounts.filter((a) => a.status === 'already_following').length

  console.log(`📊 Estado de la lista (Total: ${accounts.length}):`)
  console.log(`   - Pendientes: ${pending.length}`)
  console.log(`   - Ya seguidos en corridas previas: ${alreadyFollowed}`)
  console.log(`   - Ya los seguías de antes: ${alreadyFollowing}`)
  console.log('='.repeat(65))

  if (pending.length === 0) {
    console.log('🎉 ¡No quedan cuentas pendientes por seguir en la lista!')
    return
  }

  // Guardado al salir abruptamente (Ctrl+C)
  const cleanup = () => {
    console.log('\n💾 Guardando progreso en accounts.json...')
    saveAccounts(accounts)
    console.log('✅ Progreso guardado.')
  }
  process.on('SIGINT', () => {
    cleanup()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    cleanup()
    process.exit(0)
  })

  // Lanzar navegador persistente
  console.log('🌐 Abriendo navegador Chromium con sesión persistente...')
  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage()

  // Comprobar login en Instagram
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' })
  await sleep(3000)

  // Verificar si está logueado comprobando si existen botones de navegación (Home / Mensajes / Perfil)
  const isLoggedIn =
    (await page.locator('svg[aria-label="Inicio"], svg[aria-label="Home"]').count()) > 0 ||
    (await page.locator('svg[aria-label="Mensajes"], svg[aria-label="Messages"]').count()) > 0 ||
    (await page.locator('a[href*="/direct/inbox"]').count()) > 0

  if (!isLoggedIn) {
    console.log('\n⚠️  ATENCIÓN: No detectamos una sesión activa en Instagram.')
    console.log(
      '👉 Por favor, ve a la ventana del navegador que se abrió e INICIA SESIÓN con la cuenta de TurnoGol.',
    )
    console.log(
      '👉 Cuando ya estés dentro de tu feed, vuelve aquí y presiona ENTER para continuar...',
    )
    await waitForEnter('👉 Presiona ENTER cuando hayas iniciado sesión: ')
    await sleep(2000)
  } else {
    console.log('✅ Sesión activa detectada.')
  }

  let followedInSession = 0

  for (let idx = 0; idx < accounts.length; idx++) {
    const acc = accounts[idx]
    if (acc.status !== 'pending') continue

    if (followedInSession >= MAX_FOLLOWS_THIS_RUN) {
      console.log(`\n🛑 Límite de sesión alcanzado (${MAX_FOLLOWS_THIS_RUN} cuentas).`)
      console.log(
        '💡 Para evitar bloqueos de Instagram, se recomienda esperar unas horas o hasta mañana para la siguiente tanda.',
      )
      break
    }

    const currentNumber = followedInSession + 1
    console.log(
      `\n[${currentNumber}/${MAX_FOLLOWS_THIS_RUN}] 🔍 Revisando: @${acc.handle} (${acc.name})...`,
    )

    try {
      await page.goto(`https://www.instagram.com/${acc.handle}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })

      // Pausa humana inicial para cargar perfil y simular lectura
      await sleep(randomBetween(3000, 5500))
      await simulateHumanInteraction(page)

      // Verificar si la página no existe
      const notFound =
        (await page.locator('text="Esta página no está disponible"').count()) > 0 ||
        (await page.locator('text="Sorry, this page isn\'t available"').count()) > 0 ||
        (await page.locator('text="La página no está disponible"').count()) > 0

      if (notFound) {
        console.log(`   ⚠️ Perfil no encontrado o suspendido: @${acc.handle}`)
        acc.status = 'not_found'
        acc.updatedAt = new Date().toISOString()
        saveAccounts(accounts)
        await sleep(2000)
        continue
      }

      // Buscar botones de seguimiento
      // Instagram usa botones dentro del header principal del perfil
      const header = page.locator('header')
      const buttons = header.locator('button')
      const buttonCount = await buttons.count()

      let targetButton = null
      let buttonAction = null // 'follow' | 'already_following'

      for (let b = 0; b < buttonCount; b++) {
        const btn = buttons.nth(b)
        const text = (await btn.innerText()).trim()

        if (['Seguir', 'Follow', 'Seguir también', 'Follow Back'].includes(text)) {
          targetButton = btn
          buttonAction = 'follow'
          break
        } else if (['Siguiendo', 'Following', 'Solicitado', 'Requested'].includes(text)) {
          buttonAction = 'already_following'
          break
        }
      }

      if (buttonAction === 'already_following') {
        console.log(`   ℹ️ Ya estás siguiendo a @${acc.handle}.`)
        acc.status = 'already_following'
        acc.updatedAt = new Date().toISOString()
        saveAccounts(accounts)
        await sleep(randomBetween(1500, 3000))
        continue
      }

      if (buttonAction === 'follow' && targetButton) {
        if (isDryRun) {
          console.log(`   🧪 [DRY-RUN] Se habría hecho clic en Seguir a @${acc.handle}.`)
          acc.status = 'dry_run_pending'
        } else {
          // Movimiento hacia el botón antes del clic
          const box = await targetButton.boundingBox()
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
              steps: randomBetween(5, 12),
            })
            await sleep(randomBetween(300, 700))
          }

          await targetButton.click()
          await sleep(randomBetween(1500, 2500))

          // Verificar si saltó popup de bloqueo / límite
          const isBlocked = await checkForActionBlocked(page)
          if (isBlocked) {
            console.log('\n' + '!'.repeat(65))
            console.log('🚨 ALERTA: Instagram mostró una advertencia de bloqueo o límite.')
            console.log(
              '🚨 Deteniendo el script inmediatamente para proteger la cuenta de TurnoGol.',
            )
            console.log('!'.repeat(65))
            acc.status = 'pending' // revertir este último
            saveAccounts(accounts)
            break
          }

          console.log(`   ✅ ¡Seguido con éxito: @${acc.handle}!`)
          acc.status = 'followed'
          acc.followedAt = new Date().toISOString()
          followedInSession++
          saveAccounts(accounts)
        }

        // Si alcanzamos una tanda, pausar por varios minutos
        if (followedInSession % BATCH_SIZE === 0 && followedInSession < MAX_FOLLOWS_THIS_RUN) {
          console.log(
            `\n☕ Tanda de ${BATCH_SIZE} completada. Tomando descanso preventivo de ${BATCH_BREAK_SEC / 60} minutos...`,
          )
          await countdown(BATCH_BREAK_SEC, 'Descanso anti-baneo:')
        } else {
          // Delay humano aleatorio antes del siguiente perfil
          const waitTime = randomBetween(MIN_DELAY_SEC, MAX_DELAY_SEC)
          await countdown(waitTime, 'Pausa humana:')
        }
      } else {
        console.log(
          `   ❓ No se encontró botón claro de 'Seguir' en @${acc.handle} (puede requerir verificación o es cuenta propia).`,
        )
        acc.status = 'review_manual'
        acc.updatedAt = new Date().toISOString()
        saveAccounts(accounts)
        await sleep(randomBetween(2000, 4000))
      }
    } catch (err) {
      console.log(`   ❌ Error procesando @${acc.handle}: ${err.message}`)
      // No marcamos como fallido definitivo para reintentar luego
      await sleep(3000)
    }
  }

  saveAccounts(accounts)
  console.log('\n' + '='.repeat(65))
  console.log(`🏁 Resumen de la sesión:`)
  console.log(`   - Cuentas seguidas en esta ejecución: ${followedInSession}`)
  console.log(
    `   - Cuentas restantes pendientes: ${accounts.filter((a) => a.status === 'pending').length}`,
  )
  console.log(`   - Archivo actualizado: scripts/ig-follow/accounts.json`)
  console.log('='.repeat(65))

  await context.close()
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
