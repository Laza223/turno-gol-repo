// Arma un HTML por pantalla a partir de cada *.src.html.
// Uso: node build.mjs            deja el HTML enlazando glass.css, glass-app.css, glass.js y assets/ (liviano, para el repo)
//      node build.mjs --single   mete estilos, script y fotos adentro de cada HTML (un archivo suelto para compartir)
// En los fuentes: <!--@page title="…" desc="…" on="explorar" user="1"--> abre la página (cabecera incluida),
// <!--@end tab="reservas"--> la cierra (barra de abajo incluida) y <!--i:nombre--> pone un ícono.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const single = process.argv.includes('--single');
const css = `${readFileSync('glass.css', 'utf8')}\n${readFileSync('glass-app.css', 'utf8')}`;
const js = readFileSync('glass.js', 'utf8');

const P = {
  pin: '<path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  court: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  back: '<path d="m12 19-7-7 7-7M19 12H5"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.500c0 2.3 1.500 4 3 5.500l7 7Z"/>',
  wa: '<path d="M7.900 20A9 9 0 1 0 4 16.100L2 22Z"/>',
  phone: '<path d="M22 16.900v3a2 2 0 0 1-2.200 2 19.800 19.800 0 0 1-8.600-3.100 19.500 19.500 0 0 1-6-6 19.800 19.800 0 0 1-3.100-8.700A2 2 0 0 1 4.100 2h3a2 2 0 0 1 2 1.700c.100 1 .400 1.900.700 2.800a2 2 0 0 1-.500 2.100L8.100 9.900a16 16 0 0 0 6 6l1.300-1.300a2 2 0 0 1 2.100-.400c.900.300 1.800.600 2.800.700A2 2 0 0 1 22 16.900Z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.870M16 3.130a4 4 0 0 1 0 7.750"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.240 7.760-2.120 6.360-6.360 2.120 2.120-6.360z"/>',
  swords: '<path d="M14.500 17.500 3 6V3h3l11.500 11.500M13 19l6-6M16 16l4 4M19 21l2-2M9.500 6.500 21 18v3h-3L6.500 9.500M11 5 5 11M8 8 4 4M5 3 3 5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.300-4.300"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.010"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.100 0-2-.900-2-2V4c0-1.100.900-2 2-2h10c1.100 0 2 .900 2 2"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.300 21a1.940 1.940 0 0 0 3.400 0"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  shirt: '<path d="M20.380 3.460 16 2a4 4 0 0 1-8 0L3.620 3.460a2 2 0 0 0-1.340 2.230l.580 3.470a1 1 0 0 0 .990.840H6v10c0 1.100.900 2 2 2h8a2 2 0 0 0 2-2V10h2.150a1 1 0 0 0 .990-.840l.580-3.470a2 2 0 0 0-1.340-2.230Z"/>',
  roof: '<path d="M3 11 12 4l9 7M5 10v9h14v-9"/>',
  play: '<path d="m6 3 14 9-14 9Z"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.930 4.930l1.410 1.410M17.660 17.660l1.410 1.410M2 12h2M20 12h2M6.340 17.660l-1.410 1.410M19.070 4.930l-1.410 1.410"/>',
};
const icon = (n, cls = '') => {
  if (n === 'star') return `<svg class="${cls} star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.500l2.900 5.900 6.500.900-4.700 4.600 1.100 6.500L12 17.300l-5.800 3.100 1.100-6.500L2.600 9.300l6.500-.900z"/></svg>`;
  if (n === 'google') return '<svg class="gg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" stroke="none" d="M22.560 12.250c0-.780-.070-1.530-.200-2.250H12v4.260h5.920a5.060 5.060 0 0 1-2.200 3.320v2.770h3.570c2.080-1.920 3.270-4.740 3.270-8.100z"/><path fill="#34A853" stroke="none" d="M12 23c2.970 0 5.460-.980 7.280-2.660l-3.570-2.770c-.980.660-2.230 1.060-3.710 1.060-2.860 0-5.290-1.930-6.160-4.530H2.180v2.840A11 11 0 0 0 12 23z"/><path fill="#FBBC05" stroke="none" d="M5.840 14.090a6.600 6.600 0 0 1 0-4.180V7.070H2.180a11 11 0 0 0 0 9.860z"/><path fill="#EA4335" stroke="none" d="M12 5.380c1.620 0 3.060.560 4.210 1.640l3.150-3.150C17.450 2.090 14.970 1 12 1A11 11 0 0 0 2.180 7.070l3.660 2.840c.870-2.600 3.300-4.530 6.160-4.530z"/></svg>';
  if (!P[n]) throw new Error(`ícono desconocido: ${n}`);
  return `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
};

const NAV = [['explorar', 'Explorar', 'buscador.html'], ['rival', 'Rival', 'rival.html'], ['reservas', 'Reservas', 'mis-reservas.html'], ['complejos', 'Complejos', 'para-complejos.html']];
const TABS = [['explorar', 'Explorar', 'buscador.html', 'compass'], ['rival', 'Rival', 'rival.html', 'swords'], ['reservas', 'Reservas', 'mis-reservas.html', 'cal'], ['cuenta', 'Cuenta', 'cuenta.html', 'user']];
const attrs = (s) => Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const cur = (on, k) => (on === k ? ' aria-current="page"' : '');

const page = (a) => `<!doctype html>
<html lang="es-AR" data-theme="dark" data-sheet="none">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${a.title}</title>
<meta name="description" content="${a.desc || ''}">
<meta name="theme-color" content="#020617">
<script src="glass.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,400..900;1,62..125,400..900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="glass.css">
</head>
<body>
<div class="ambient" aria-hidden="true"></div>
<a class="skip" href="#main">Ir al contenido</a>

<header class="top">
  <a class="logo" href="home.html" aria-label="TurnoGol, inicio">Turno<b>Gol</b></a>
  <nav class="top__links" aria-label="Principal">
    ${NAV.map(([k, t, h]) => `<a href="${h}"${cur(a.on, k)}>${t}</a>`).join('')}
  </nav>
  <div class="top__r">
    <button class="theme glass" type="button" id="theme" aria-label="Cambiar a tema claro">${icon('moon', 'moon')}${icon('sun', 'sun')}</button>
    ${a.user ? `<a class="top__in" href="cuenta.html"${cur(a.on, 'cuenta')}>Cuenta</a>` : '<a class="top__in" href="ingresar.html">Ingresar</a>'}
  </div>
</header>
`;
const foot = () => `<footer class="closing" style="padding-top:0">
  <div class="wrap">
    <p class="word" aria-hidden="true">Turno<b>Gol</b></p>
    <div class="foot">
      <div class="foot__brand"><a class="logo" href="home.html" aria-label="TurnoGol, inicio">Turno<b>Gol</b></a><p>Turnos de fútbol para reservar online, en los complejos de tu zona.</p></div>
      <div><h3>Jugadores</h3><ul><li><a href="buscador.html">Buscar canchas</a></li><li><a href="rival.html">Tablón de Rival</a></li></ul></div>
      <div><h3>Complejos</h3><ul><li><a href="para-complejos.html">TurnoGol para complejos</a></li><li><a href="precios.html">Planes</a></li><li><a href="blog.html">Blog</a></li></ul></div>
      <div><h3>Ayuda</h3><ul><li><a href="articulo.html">Términos</a></li><li><a href="articulo.html">Privacidad</a></li><li><a href="para-complejos.html">Escribinos</a></li></ul></div>
    </div>
    <div class="legal"><span>&copy; 2026 TurnoGol</span><a href="credits.html">Fotos vía Wikimedia Commons</a></div>
  </div>
</footer>
`;
const end = (a) => `${a.tab === 'none' ? '' : `
<nav class="tabbar glass" aria-label="Navegación del jugador">
  ${TABS.map(([k, t, h, i]) => `<a href="${h}"${cur(a.tab, k)}>${icon(i)}${t}</a>`).join('\n  ')}
</nav>`}
</body>
</html>
`;

for (const file of readdirSync('.').filter((f) => f.endsWith('.src.html'))) {
  const name = file.replace('.src.html', '');
  let s = readFileSync(file, 'utf8');
  s = s.replace(/<!--@page ([^>]*)-->\r?\n?/, (m, a) => page(attrs(a)));
  s = s.replace(/<!--@end ?([^>]*)-->\r?\n?/, (m, a) => end(attrs(a)));
  s = s.replace(/<!--@foot-->\r?\n?/, () => foot());
  s = s.replace(/<!--i:(\w+)(?: ([\w -]+))?-->/g, (m, n, cls) => icon(n, cls));
  let n = 0;
  if (single) {
    s = s.replace('<link rel="stylesheet" href="glass.css">', () => `<style>\n${css}</style>`);
    s = s.replace('<script src="glass.js"></script>', () => `<script>\n${js}</script>`);
    s = s.replace(/(src|poster)="(assets\/img\/[^"]+\.webp)"/g, (m, attr, path) => { n += 1; return `${attr}="data:image/webp;base64,${readFileSync(path).toString('base64')}"`; });
  } else {
    s = s.replace('<link rel="stylesheet" href="glass.css">', '<link rel="stylesheet" href="glass.css">\n<link rel="stylesheet" href="glass-app.css">');
    n = (s.match(/(src|poster)="assets\/img\//g) || []).length;
  }
  writeFileSync(`${name}.html`, s);
  console.log(`${name}.html: ${n} fotos ${single ? 'adentro' : 'enlazadas'}, ${Math.round(Buffer.byteLength(s) / 1024)} KB`);
}
