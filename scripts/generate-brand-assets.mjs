import fs from 'fs'
import path from 'path'

const dir = path.resolve('public/brand-assets')
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}

// 1. Horizontal Brand Logo (Color - Light Mode)
const logoHorizontalColor = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 100" width="420" height="100">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sora:ital,wght@1,800;1,900&amp;display=swap');
      .logo-text { font-family: 'Sora', 'Arial Black', sans-serif; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -2px; }
    </style>
  </defs>
  <text x="20" y="70" class="logo-text" font-size="64" fill="#020617">TURNO<tspan fill="#047857">GOL</tspan></text>
</svg>`

// 2. Horizontal Logo White (Dark Mode)
const logoHorizontalWhite = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 100" width="420" height="100">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sora:ital,wght@1,800;1,900&amp;display=swap');
      .logo-text { font-family: 'Sora', 'Arial Black', sans-serif; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -2px; }
    </style>
  </defs>
  <text x="20" y="70" class="logo-text" font-size="64" fill="#FFFFFF">TURNO<tspan fill="#34D399">GOL</tspan></text>
</svg>`

// 3. Horizontal Logo Pure White (Monochrome)
const logoHorizontalMonoWhite = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 100" width="420" height="100">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sora:ital,wght@1,800;1,900&amp;display=swap');
      .logo-text { font-family: 'Sora', 'Arial Black', sans-serif; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -2px; }
    </style>
  </defs>
  <text x="20" y="70" class="logo-text" font-size="64" fill="#FFFFFF">TURNO<tspan fill="#FFFFFF">GOL</tspan></text>
</svg>`

// 4. Horizontal Logo Pure Black (Monochrome)
const logoHorizontalMonoBlack = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 100" width="420" height="100">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sora:ital,wght@1,800;1,900&amp;display=swap');
      .logo-text { font-family: 'Sora', 'Arial Black', sans-serif; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -2px; }
    </style>
  </defs>
  <text x="20" y="70" class="logo-text" font-size="64" fill="#000000">TURNO<tspan fill="#000000">GOL</tspan></text>
</svg>`

// 5. Isotipo TG (Color)
const isotipoColor = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sora:ital,wght@1,900&amp;display=swap');
      .logo-text { font-family: 'Sora', 'Arial Black', sans-serif; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -2px; }
    </style>
  </defs>
  <text x="20" y="115" class="logo-text" font-size="100" fill="#020617">T<tspan fill="#047857">G</tspan></text>
</svg>`

// 6. Isotipo TG (White / Emerald on Dark)
const isotipoWhite = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sora:ital,wght@1,900&amp;display=swap');
      .logo-text { font-family: 'Sora', 'Arial Black', sans-serif; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -2px; }
    </style>
  </defs>
  <text x="20" y="115" class="logo-text" font-size="100" fill="#FFFFFF">T<tspan fill="#34D399">G</tspan></text>
</svg>`

// 7. Isotipo TG (Icon Badge with Emerald Gradient)
const isotipoBadge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="100%" stop-color="#047857" />
    </linearGradient>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sora:ital,wght@1,900&amp;display=swap');
      .logo-text { font-family: 'Sora', 'Arial Black', sans-serif; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -2px; }
    </style>
  </defs>
  <rect width="200" height="200" rx="44" fill="url(#grad)" />
  <text x="40" y="140" class="logo-text" font-size="110" fill="#FFFFFF">TG</text>
</svg>`

// 8. Logo Vertical / Centered
const logoVertical = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="300" height="200">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sora:ital,wght@1,900&amp;display=swap');
      .logo-text { font-family: 'Sora', 'Arial Black', sans-serif; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -2px; }
    </style>
  </defs>
  <text x="150" y="80" text-anchor="middle" class="logo-text" font-size="70" fill="#047857">TG</text>
  <text x="150" y="150" text-anchor="middle" class="logo-text" font-size="48" fill="#020617">TURNO<tspan fill="#047857">GOL</tspan></text>
</svg>`

fs.writeFileSync(path.join(dir, 'logo_horizontal_color.svg'), logoHorizontalColor)
fs.writeFileSync(path.join(dir, 'logo_horizontal_blanco.svg'), logoHorizontalWhite)
fs.writeFileSync(path.join(dir, 'logo_horizontal_mono_blanco.svg'), logoHorizontalMonoWhite)
fs.writeFileSync(path.join(dir, 'logo_horizontal_mono_negro.svg'), logoHorizontalMonoBlack)
fs.writeFileSync(path.join(dir, 'isotipo_tg_color.svg'), isotipoColor)
fs.writeFileSync(path.join(dir, 'isotipo_tg_blanco.svg'), isotipoWhite)
fs.writeFileSync(path.join(dir, 'isotipo_app_badge.svg'), isotipoBadge)
fs.writeFileSync(path.join(dir, 'logo_vertical.svg'), logoVertical)

console.log('SVGs generated successfully in public/brand-assets/')
