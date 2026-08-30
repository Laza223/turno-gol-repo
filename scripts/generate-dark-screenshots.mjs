import http from 'http'
import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'

const PORT = 7088
const outDir = path.resolve('public/brand-assets')

function createServer() {
  return http.createServer((req, res) => {
    let rawUrl = req.url.split('?')[0]
    let filePath = path.join('storybook-static', rawUrl)
    if (filePath.endsWith('/') || filePath === 'storybook-static') {
      filePath = path.join(filePath, 'index.html')
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath)
      const types = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
      }
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' })
      res.end(fs.readFileSync(filePath))
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  })
}

const darkScreenshots = [
  // 1. Dashboard & Métricas (Dark)
  {
    id: 'admin-metricas-metricsdashboard--default',
    filename: '01_dashboard_metricas.png',
    viewport: { width: 1440, height: 950 },
  },
  // 2. Grilla y Agenda de Turnos en Vivo (Dark)
  {
    id: 'booking-grid-bookinggrid--primera-reserva',
    filename: '02_grilla_agenda_turnos.png',
    viewport: { width: 1440, height: 900 },
  },
  // 3. Configuración de Canchas (Dark)
  {
    id: 'admin-canchas-courtform--editar-cancha',
    filename: '03_configuracion_canchas.png',
    viewport: { width: 1200, height: 850 },
  },
  // 4. Configuración de Horarios y Franjas (Dark)
  {
    id: 'admin-settings-horariosform--cierra-despues-de-medianoche',
    filename: '04_configuracion_horarios.png',
    viewport: { width: 1200, height: 900 },
  },
  // 5. Políticas de Reservas y Señas MP (Dark)
  {
    id: 'admin-settings-reservaspolicyform--default',
    filename: '05_politica_reservas_senas.png',
    viewport: { width: 1200, height: 850 },
  },
  // 6. Caja Unificada y Cierre Diario (Dark)
  {
    id: 'admin-caja-cierrecard--con-diferencia',
    filename: '06_caja_y_deudas.png',
    viewport: { width: 1200, height: 850 },
  },
  // 7. Portal de Búsqueda y Reserva Online (Dark)
  {
    id: 'public-landing-bookingcardmockup--default',
    filename: '07_reserva_online_formulario.png',
    viewport: { width: 1100, height: 850 },
  },
  // 8. Checkout del Turno y Seña (Dark)
  {
    id: 'player-checkout-bookingsummary--default',
    fallbackId: 'admin-reservas-bookingcharges--con-cargos-y-total',
    filename: '08_reserva_online_checkout.png',
    viewport: { width: 1100, height: 800 },
  },
  // 9. Detalle de Reserva y Control de Asistencia (Dark)
  {
    id: 'admin-reservas-bookingdetailcard--confirmada',
    filename: '09_reserva_online_mercadopago.png',
    viewport: { width: 1200, height: 850 },
  },
  // 10. Cantina y Punto de Venta (Dark)
  {
    id: 'admin-caja-canteenquicksale--con-productos',
    filename: '10_cantina_punto_de_venta.png',
    viewport: { width: 1200, height: 850 },
  },
  // 11. Onboarding y Creación de Complejo (Dark)
  {
    id: 'onboarding-wizardshell--paso-2-horarios',
    filename: '11_onboarding_creacion_complejo.png',
    viewport: { width: 1200, height: 850 },
  },
  // 12. Turnos Fijos y Abonados (Dark)
  {
    id: 'admin-reservas-bookinglistitem--abonado',
    filename: '12_turno_fijo_abonados.png',
    viewport: { width: 1200, height: 750 },
  },
]

async function run() {
  const data = JSON.parse(fs.readFileSync('storybook-static/index.json', 'utf8'))
  const allIds = Object.keys(data.entries)

  const server = createServer()
  await new Promise((resolve) => server.listen(PORT, resolve))
  console.log(`Storybook server listening on http://localhost:${PORT}`)

  const browser = await chromium.launch()
  const context = await browser.newContext({
    deviceScaleFactor: 2, // 2x Retina resolution
    colorScheme: 'dark',
  })
  const page = await context.newPage()

  for (const item of darkScreenshots) {
    let targetStoryId = item.id
    if (!allIds.includes(targetStoryId)) {
      if (item.fallbackId && allIds.includes(item.fallbackId)) {
        targetStoryId = item.fallbackId
      } else {
        const partial = allIds.find((id) => id.includes(item.id.split('--')[0]))
        if (partial) {
          targetStoryId = partial
        } else {
          console.warn(`Warning: Could not match story for ${item.id}`)
          continue
        }
      }
    }

    console.log(`Capturing Dark Mode: ${targetStoryId} -> ${item.filename}...`)
    await page.setViewportSize(item.viewport)
    await page.goto(`http://localhost:${PORT}/iframe.html?id=${targetStoryId}&viewMode=story`, {
      waitUntil: 'networkidle',
    })

    // Inyectar clase .dark estricta en HTML y Body + estilos dark surface
    await page.evaluate(() => {
      document.documentElement.classList.add('dark')
      document.body.classList.add('dark')
      document.documentElement.style.colorScheme = 'dark'
      document.documentElement.style.backgroundColor = '#020617'
      document.body.style.backgroundColor = '#020617'
      document.body.style.color = '#f8fafc'

      const root = document.getElementById('storybook-root')
      if (root) {
        root.classList.add('dark')
        root.style.backgroundColor = '#020617'
      }
    })

    // Wait for animations/render
    await page.waitForTimeout(600)

    const outPath = path.join(outDir, item.filename)
    await page.screenshot({ path: outPath, fullPage: false })
    console.log(`✓ Generated dark screenshot: ${item.filename}`)
  }

  await browser.close()
  server.close()
  console.log('🎉 All dark-mode screenshots successfully updated in public/brand-assets/')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
