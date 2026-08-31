import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const outDir = path.resolve('public/brand-assets')
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

const htmlTemplate = (content, bg = 'transparent') => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wght@1,800;1,900&family=Sora:ital,wght@1,800;1,900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${bg};
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: 'Sora', 'Archivo', sans-serif;
    }
    .brand-logo {
      font-weight: 900;
      font-style: italic;
      text-transform: uppercase;
      letter-spacing: -0.04em;
      line-height: 1;
      display: inline-flex;
      align-items: baseline;
      white-space: nowrap;
    }
    .logo-h {
      font-size: 80px;
      padding: 30px 40px;
    }
    .logo-v {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 40px;
    }
    .iso {
      font-size: 140px;
      padding: 30px 40px;
    }
    .badge {
      width: 240px;
      height: 240px;
      border-radius: 54px;
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 20px 40px rgba(4, 120, 87, 0.35);
    }
  </style>
</head>
<body>
  <div id="target">${content}</div>
</body>
</html>
`

const items = [
  // 1. Horizontal Color (Dark text + Green)
  {
    name: 'logo_turnogol_horizontal_color.png',
    html: `
      <div class="brand-logo logo-h" style="color: #020617;">
        TURNO<span style="color: #047857;">GOL</span>
      </div>
    `,
  },
  // 2. Horizontal White (White text + Mint Green)
  {
    name: 'logo_turnogol_horizontal_blanco.png',
    html: `
      <div class="brand-logo logo-h" style="color: #FFFFFF;">
        TURNO<span style="color: #34D399;">GOL</span>
      </div>
    `,
  },
  // 3. Horizontal Monochrome White (Pure white)
  {
    name: 'logo_turnogol_horizontal_mono_blanco.png',
    html: `
      <div class="brand-logo logo-h" style="color: #FFFFFF;">
        TURNO<span style="color: #FFFFFF;">GOL</span>
      </div>
    `,
  },
  // 4. Horizontal Monochrome Black (Pure black)
  {
    name: 'logo_turnogol_horizontal_mono_negro.png',
    html: `
      <div class="brand-logo logo-h" style="color: #000000;">
        TURNO<span style="color: #000000;">GOL</span>
      </div>
    `,
  },
  // 5. Vertical Color
  {
    name: 'logo_turnogol_vertical_color.png',
    html: `
      <div class="brand-logo logo-v">
        <span style="font-size: 110px; color: #047857; line-height: 0.9;">TG</span>
        <span style="font-size: 56px; color: #020617;">TURNO<span style="color: #047857;">GOL</span></span>
      </div>
    `,
  },
  // 6. Vertical White
  {
    name: 'logo_turnogol_vertical_blanco.png',
    html: `
      <div class="brand-logo logo-v">
        <span style="font-size: 110px; color: #34D399; line-height: 0.9;">TG</span>
        <span style="font-size: 56px; color: #FFFFFF;">TURNO<span style="color: #34D399;">GOL</span></span>
      </div>
    `,
  },
  // 7. Isotipo TG Color
  {
    name: 'isotipo_tg_color.png',
    html: `
      <div class="brand-logo iso" style="color: #020617;">
        T<span style="color: #047857;">G</span>
      </div>
    `,
  },
  // 8. Isotipo TG Blanco
  {
    name: 'isotipo_tg_blanco.png',
    html: `
      <div class="brand-logo iso" style="color: #FFFFFF;">
        T<span style="color: #34D399;">G</span>
      </div>
    `,
  },
  // 9. Isotipo TG App Badge
  {
    name: 'isotipo_tg_badge.png',
    html: `
      <div class="badge">
        <span class="brand-logo" style="font-size: 115px; color: #FFFFFF;">TG</span>
      </div>
    `,
  },
]

async function generate() {
  console.log('Launching browser to render high-res transparent PNGs...')
  const browser = await chromium.launch()
  const context = await browser.newContext({
    deviceScaleFactor: 2, // 2x Retina resolution
  })
  const page = await context.newPage()

  for (const item of items) {
    const fullHtml = htmlTemplate(item.html)
    await page.setContent(fullHtml, { waitUntil: 'networkidle' })
    // Wait for fonts
    await page.evaluate(() => document.fonts.ready)

    const element = await page.$('#target')
    const outPath = path.join(outDir, item.name)
    await element.screenshot({
      path: outPath,
      omitBackground: true, // Transparent PNG
    })
    console.log(`Generated: ${item.name}`)
  }

  await browser.close()
  console.log('All PNG logos generated successfully!')
}

generate().catch((err) => {
  console.error(err)
  process.exit(1)
})
