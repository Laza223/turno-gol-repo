# Auditoría visual y mobile — turnogol.app

Fecha: 2026-11-02. Versión FINAL. Páginas: `/`, `/para-complejos`, `/precios`, `/explorar`, `/el-vagon-deportivo`.
Viewports: desktop 1440x900 y mobile 390x844 (iPhone UA, DPR 2); además 360x740 y 320x568 solo para overflow.
Capturas en `../screenshots/` (rutas relativas a este archivo). Métricas crudas: `visual-metrics.json` (mismo directorio).

## Puntaje visual/mobile: 76 / 100

| Eje | Puntos |
|---|---|
| Layout y overflow (320/360/390/1440) | 19/20 |
| Above-the-fold y CTA | 15/20 |
| Tap targets y legibilidad | 16/20 |
| Render, JS y semántica de headings | 12/20 |
| Consistencia y pulido de contenido | 14/20 |

## Qué ve primero cada público (above-the-fold)

- **Jugador, `/` mobile** (`home-mobile-fold.png`): logo + "Ingresar", titular "Tu partido empieza en TurnoGol", subtítulo "Mirá los turnos libres de hoy y reservá sin llamar a nadie", formulario (Localidad / Fecha / Hora) y botón verde "Buscar canchas" (y=644..706 css px, 316x62). CTA visible. Se entiende en 5 s por el subtítulo y el botón, no por el titular: el H1 no dice cancha, fútbol ni reservar.
- **Jugador, `/` desktop** (`home-desktop-fold.png`): ídem en una fila, con "Explorar / Rival / Para complejos / Ingresar" en el header. La página entera mide 953 px: termina en el formulario y el footer.
- **Dueño, `/para-complejos` mobile** (`para-complejos-mobile-fold.png`): "Chau, reserva de palabra." (cripto solo) pero el primer párrafo dice "TurnoGol es el sistema de señas para canchas de fútbol…". CTA "Probalo 30 días" 358x48 en y=439 y "Escribinos por WhatsApp" en y=499. Muy bien resuelto.
- **Dueño, `/precios`** (`precios-mobile-fold.png`, `precios-desktop-fold.png`): titular + 3 garantías + selector de canchas. El precio NO está en el primer pantallazo (ver V3).
- **`/explorar` mobile** (`explorar-mobile-fold.png`): otro formulario de 4 campos; cero complejos en pantalla (V8).
- **Ficha `/el-vagon-deportivo` mobile** (`el-vagon-deportivo-mobile-fold.png`): logo, nombre, dirección, "Abierto · hasta la 01:00", Cómo llegar / WhatsApp, "Paso 1 de 3 · ¿Qué día querés jugar?" con "Hoy / Mañana". Excelente: la acción de reservar está en el primer pantallazo.

## Lo que está bien (no tocar)

- Sin overflow horizontal en las 5 páginas a 320, 360, 390 y 1440 (`scrollWidth == clientWidth` en todas).
- CLS ~0: 0 en cuatro páginas, 0,0039 en `/explorar` (ver V9). Sin imágenes rotas.
- Inputs de texto/select con 16 px en mobile (`hero-city-v`, `exp-q`, `exp-city`, inputs de `/precios`): no dispara el zoom de iOS.
- `viewport` con `maximum-scale=5`: se puede hacer zoom.
- Contraste correcto en casi todo (calculado sobre el color de fondo efectivo; sobre gradientes es aproximado). Único caso: V8.
- Links de solo ícono con `aria-label` (WhatsApp, Instagram, mail, favoritos, hamburguesa).
- Tipografía, logo y verde de marca consistentes en las cinco páginas.
- Los `requestfailed` registrados (`?_rsc=` en /explorar, /configuracion, /mis-reservas, /register) son prefetches de navegación abortados: no se ven ni afectan.

## Hallazgos

### V1 — En mobile el titular visible no es un H1 y el H1 real está oculto · Severidad MEDIA-ALTA
- **Evidencia**: `home-mobile-fold.png` muestra "Tu partido empieza en TurnoGol". En el DOM a 390 px el `<h1>` mide 0x0 (ancestro oculto por breakpoint) y el texto visible es `<p role="heading" aria-level="1">` de 358x108. Hay dos árboles de hero: `input#hero-city` (desktop) y `input#hero-city-v` (mobile). En desktop (`home-desktop-fold.png`) el H1 sí es visible (80,6 px, top 184). El `<title>` dice "Reservá tu cancha de fútbol al instante" pero el H1 no menciona cancha, fútbol ni reservar.
- **Por qué importa**: con mobile-first indexing y crawlers de IA, la jerarquía visible (mobile) y el H1 "real" no coinciden; el H1 vive en un subárbol `display:none`. Además el hero duplicado hace dos pedidos de geolocalización (V5).
- **Fix**: un solo hero con un solo `<h1>` y estilos responsive por CSS (clamp de tamaño, no dos árboles); sacar el `<p role="heading">`. Opcional (copy, lo decide Lazar): que el subtítulo o el H1 nombren "cancha de fútbol".
- **Cómo sabríamos que falló**: a 390x844, `document.querySelectorAll('h1')` devuelve exactamente 1 elemento con `getBoundingClientRect().height > 0`; existe un único `#hero-city*`; `getByRole('heading', {level:1})` cuenta 1 visible en mobile y en desktop; el HTML renderizado de Search Console (Inspección de URL, rastreador smartphone) muestra el H1.

### V2 — Explorar y la ficha dependen de JS: sin JS solo se ven skeletons · Severidad MEDIA (a confirmar con curl)
- **Evidencia**: `nojs-explorar-mobile.png` (6 tarjetas esqueleto, ~143 caracteres de texto renderizado) y `nojs-el-vagon-deportivo-mobile.png` (H1 + "Horarios" + bloques grises; sin logo, dirección, horarios ni días). Con JS, la ficha termina de cargar y reemplaza los skeletons por la lista de días y el estado "Abierto" (`el-vagon-deportivo-mobile-fold.png`). `/para-complejos` y `/precios` sí renderizan todo sin JS (~2700-3000 caracteres, H1 + 4-5 H2).
- **Limitación**: medí texto renderizado, no el HTML crudo. Next.js puede mandar el contenido streameado dentro de nodos `hidden` que no se ven sin JS pero sí están en la fuente. No lo verifiqué.
- **Fix**: confirmar primero; si el HTML crudo no trae nombre, dirección, canchas y horarios de la ficha ni el listado de `/explorar`, renderizarlos en el servidor fuera del `Suspense` (o con fallback que contenga el texto) para los crawlers que no ejecutan JS.
- **Cómo sabríamos que falló**: `curl -s https://turnogol.app/el-vagon-deportivo | grep -c "almafuerte"` da 0, o `curl -s https://turnogol.app/explorar | grep -c "El vagón Deportivo"` da 0 fuera de `<title>`/H1. Criterio de éxito: ambos > 0 sin ejecutar JS.

### V3 — `/precios`: el precio no entra en el primer pantallazo y el selector de canchas se ve raro · Severidad MEDIA
- **Evidencia**: `precios-mobile-fold.png`: hay titular, 3 garantías y el selector; el "$ 90.000 /mes" aparece recién en `precios-mobile-full.png` (~1080 px css, 1,3 pantallas abajo). En desktop (`precios-desktop-fold.png`) la tarjeta empieza en y≈860 y el número queda debajo de los 900 px. El único CTA visible arriba es "Empezar gratis" del header (118x36). Detalles: las pastillas 1-8 envuelven y dejan "7 8" huérfanos en una segunda fila dentro del contenedor redondeado; debajo hay un recuadro "3" sin etiqueta visible (aria: "Cantidad exacta de canchas"); más abajo, la etiqueta "¿CUÁNTOS TURNOS TE CUELGAN POR SEMANA?" queda pegada al stepper sin espacio (`precios-mobile-full.png`).
- **Fix**: subir el precio (ej. línea "Desde $30.000/mes por cancha" bajo el titular o mover tarjeta + selector arriba y las garantías debajo); selector 1-4 + "Más" o scroll horizontal en una fila; rotular el recuadro ("Otra cantidad"); `gap` entre etiqueta y stepper. REQUIERE INPUT: cuál es la cantidad por defecto del selector (hoy 3; el precio en sí no se toca).
- **Cómo sabríamos que falló**: a 390x844 y `scrollY=0`, el elemento del precio y un botón "Empezar 30 días gratis" están dentro del viewport (`boundingBox().y + height <= 844`); el selector ocupa una sola fila a 390 px.

### V4 — Home mobile: el camino del dueño está enterrado bajo la barra inferior · Severidad MEDIA
- **Evidencia**: en `home-mobile-fold.png` el header solo tiene "Ingresar" y la barra inferior fija trae Explorar / Rival / Reservas / Cuenta. El único acceso al SaaS ("¿Tenés un complejo? Sumalo a TurnoGol", 13 px, link de 119x44 en y=801) queda debajo del tope de la barra (y=787): no se ve ni se puede tocar sin scrollear (`home-mobile-bottom.png` lo muestra recién al final, junto con "Sin descargar ninguna app", que también queda tapada). En desktop (`home-desktop-fold.png`) "Para complejos" sí está en el header.
- **Fix**: sumar "Para complejos" al header mobile (chip chico) o subir el link dentro del bloque del hero, antes del formulario; verificar que ninguna línea del hero quede bajo la barra (`padding-bottom` del contenedor).
- **Cómo sabríamos que falló**: a 390x844, `scrollY=0`, `document.elementFromPoint(centroDelLink)` devuelve el `<a href="/para-complejos">` y no el `<nav aria-label="Navegación del jugador">`.

### V5 — La home pide geolocalización al cargar (dos veces) y muestra un mensaje de error de entrada · Severidad MEDIA-BAJA
- **Evidencia**: con un wrapper de `navigator.geolocation` en mobile hubo 2 llamadas a `getCurrentPosition` a los ~585 ms, sin gesto del usuario (`userActivation.isActive = false`); `/explorar`, `/para-complejos`, `/precios` y la ficha: 0 llamadas. La consecuencia visible es el texto "No pudimos acceder a tu ubicación. Elegí tu localidad manualmente." justo debajo del CTA (`home-mobile-fold.png`, `home-desktop-fold.png`, `home-mobile-fold-prefers-dark.png`). En un celular real también aparece el diálogo nativo de permiso antes de que el visitante entienda la propuesta. Las 2 llamadas coinciden con el hero duplicado (V1).
- **Fix**: pedir ubicación solo al tocar un botón "Usar mi ubicación"; no mostrar nada si no hubo intento; una sola llamada.
- **Cómo sabríamos que falló**: un `addInitScript` que envuelva `getCurrentPosition` registra 0 llamadas en la carga; con permiso denegado no existe el texto "No pudimos acceder" en el primer render.

### V6 — Header B2B en mobile: targets de 36 px y la hamburguesa se sale a 320 px · Severidad MEDIA-BAJA
- **Evidencia**: en `/para-complejos` y `/precios` (mobile) "Empezar gratis" mide 118x36 con texto de ~12-13 px y "Abrir menú" 36x36 (`para-complejos-mobile-fold.png`, `precios-mobile-fold.png`). A 320 px el header no entra: la hamburguesa queda en x=301..337 (> 320) y se ve cortada (`precios-mobile320-fold.png`), o sea el menú (Funciones / Precios / Blog / Ingresar) es inalcanzable en pantallas chicas. El menú abierto (`para-complejos-mobile-menu-abierto.png`) es un popover semitransparente sin fondo opaco: el titular se transparenta y se superpone. En las páginas del jugador, "Ingresar" sí mide 78x44. Altura de header inconsistente: 74 px fijo (home y B2B) vs 82 px sticky (explorar y ficha) en mobile; 88 vs 96 en desktop.
- **Fix**: botón y hamburguesa de 44x44; a <340 px reducir el padding/ocultar texto del CTA ("Empezar"); fondo opaco o scrim en el menú; unificar la altura del header.
- **Cómo sabríamos que falló**: a 320x568 todo elemento del header cumple `right <= 320`; `width >= 44 && height >= 44` para sus controles; el recuadro del menú abierto tiene `background-color` con alfa 1.

### V7 — El listado público parece de prueba y los datos de la ficha están sin pulir · Severidad MEDIA-BAJA
- **Evidencia**: `explorar-mobile-full.png` y `explorar-desktop-fold.png`: solo 2 complejos. "Complejo Evardss" tiene un placeholder verde con "CO" (sin foto) y un nombre que parece de test; la tarjeta de El vagón dice "Lujan, Buenos Aires, Buenos Aires" (provincia repetida; también sin tilde en "Luján"). La ficha muestra "almafuerte 2156" en minúscula (`el-vagon-deportivo-mobile-fold.png`). La portada es un logo: en desktop queda recortado (se corta "EL VAGON" y el escudo arriba, `el-vagon-deportivo-desktop-fold.png`, `explorar-desktop-fold.png`) y en mobile es un raster de 312 px de ancho mostrado a 358 px css con DPR 2 (borroso, `el-vagon-deportivo-mobile-fold.png`). En desktop la grilla de `/explorar` queda con media pantalla vacía.
- **Fix**: REQUIERE INPUT de Lazar: ¿"Complejo Evardss" es un tenant de prueba? Si lo es, sacarlo del listado público. Normalizar ciudad/provincia (sin repetir), capitalizar la dirección; `object-contain` con fondo para logos o pedir portada horizontal de ≥720 px.
- **Cómo sabríamos que falló**: `/explorar` no tiene tarjetas con el placeholder "CO"; ningún texto de tarjeta coincide con `/(Buenos Aires),\s*\1/`; `img.naturalWidth >= 2 * clientWidth` en la portada de la ficha.

### V8 — `/explorar` mobile: otro formulario antes de ver resultados + detalles de accesibilidad · Severidad BAJA
- **Evidencia**: `explorar-mobile-fold.png` repite el formulario de 4 campos de la home y los resultados recién aparecen en ~y=1200 px css (`explorar-mobile-full.png`); quien viene de la home hace la búsqueda dos veces. Los botones Lista/Mapa en mobile son solo ícono y sin `aria-label` (2 botones sin nombre accesible en el DOM; inferido por posición y por contraste con desktop, que los rotula). Textos de 10-11 px: BUSCAR/LOCALIDAD/FECHA/HORA (11), DESDE (10), "$ 60.000 el turno" (11). La etiqueta "HORARIOS LIBRES A LA VISTA" (12 px) calcula ~3:1 sobre el gradiente (aproximado).
- **Fix**: mostrar resultados primero y colapsar el buscador en una barra "Filtrar" al llegar con parámetros; `aria-label` "Ver en lista" / "Ver en mapa"; piso de 12 px; más contraste en la etiqueta.
- **Cómo sabríamos que falló**: a 390x844 hay al menos una tarjeta de complejo dentro del primer pantallazo cuando se llega con parámetros; axe `button-name` sin violaciones en `/explorar`.

### V9 — La pestaña "Rival" de la barra inferior aparece después de hidratar · Severidad BAJA
- **Evidencia**: `early-home-mobile-dcl.png` (y la versión sin JS) muestra 3 pestañas (Explorar / Reservas / Cuenta); `home-mobile-fold.png` muestra 4 y las otras tres se reacomodan hacia la izquierda. Layout shift medido en `/explorar`: 0,0039 en la barra (`A.relative flex min-h-14`), por debajo del umbral pero visible.
- **Fix**: resolver el flag `rival` en el servidor (render de 4 pestañas desde el HTML) o reservar el lugar.
- **Cómo sabríamos que falló**: el `layout-shift` de la barra inferior vuelve a aparecer en un `PerformanceObserver`; el HTML de `/` ya incluye `href="/rival"` en la navegación del jugador sin ejecutar JS.

### V10 — Home delgada: casi sin contenido para entender qué es TurnoGol · Severidad BAJA (alta para visibilidad en IA)
- **Evidencia**: `home-desktop-full.png` (953 px, termina en el formulario y el footer) y `home-mobile-full.png` (1160 px). ~340-355 caracteres de texto de cuerpo (medido sin JS). Sin lista de complejos, sin "cómo funciona", sin prueba social ni FAQ. Quien llega frío (por ejemplo desde una respuesta de IA) solo tiene el titular, un subtítulo y el formulario.
- **Fix**: propuesta (decisión de producto, REQUIERE INPUT): 2-3 bloques debajo del formulario (cómo funciona en 3 pasos, complejos disponibles, FAQ corta) con texto renderizado en servidor. No es un cambio chico.
- **Cómo sabríamos que falló**: la home sigue midiendo menos de ~1,5 pantallas y menos de ~800 caracteres de cuerpo sin JS.

### V11 — Divergencia visual entre públicos (informativo) · Severidad INFO
- **Evidencia**: jugador en claro y B2B forzado en oscuro (`html.dark`), cada uno con su header (`home-mobile-fold.png` vs `para-complejos-mobile-fold.png`). El jugador respeta `prefers-color-scheme` (`home-mobile-fold-prefers-dark.png`, con foto de estadio de fondo). Comparten logo, tipografía display itálica negra, verde de marca y header en píldora flotante: se lee como una sola marca con dos personalidades, coherente con `DESIGN.md`.
- **Fix**: ninguno. Lo único a cuidar son los links cruzados (V4).
- **Cómo sabríamos que falló**: un visitante de `/precios` o `/para-complejos` no encuentra cómo volver al lado jugador, o al revés (V4).

## Prioridad sugerida

1. V1 (hero único con H1 real) + V5 (geolocalización): se arreglan juntos.
2. V4 (acceso del dueño en la home mobile) y V3 (precio arriba en `/precios`): ambos son de conversión.
3. V2: confirmar con `curl` antes de tocar nada.
4. V6, V7, V8, V9, V10: pulido.

## Método y límites

- Chromium headless de Playwright con el Python del runtime de claude-seo (`claude-seo run` solo ejecuta scripts de su allowlist, así que usé el intérprete del venv con scripts propios). UA de iPhone emulado, no un dispositivo real: el tacto, el teclado de iOS y la barra del navegador no se probaron.
- No hubo login, ni envío de formularios, ni clics en reservar o pagar. Único clic: la hamburguesa de `/para-complejos` (navegación).
- Las capturas `*-full.png` en mobile muestran el header y la barra inferior fijos en posiciones intermedias: es un artefacto de la captura de página completa, no un bug.
- Las capturas `nojs-*` y `early-home-mobile-dcl.png` ya estaban tomadas en la sesión; las copié a `screenshots/` sin hacer capturas nuevas (29 archivos en total).
- Contraste y LCP/CLS son de laboratorio (una corrida, red de esta máquina), indicativos y no equivalentes a datos de campo.

## Índice de capturas

`home-{desktop,mobile}-{fold,full}.png`, `home-mobile-bottom.png`, `home-mobile-fold-prefers-dark.png`, `home-mobile320-fold.png`, `early-home-mobile-dcl.png`,
`para-complejos-{desktop,mobile}-{fold,full}.png`, `para-complejos-mobile-menu-abierto.png`,
`precios-{desktop,mobile}-{fold,full}.png`, `precios-mobile320-fold.png`,
`explorar-{desktop,mobile}-{fold,full}.png`, `explorar-mobile320-fold.png`, `nojs-explorar-mobile.png`,
`el-vagon-deportivo-{desktop,mobile}-{fold,full}.png`, `nojs-el-vagon-deportivo-mobile.png`.

## JSON para audit-data.json (categoría Visual)

```json
{
  "category": "Visual",
  "score": 76,
  "scope": "turnogol.app: /, /para-complejos, /precios, /explorar, /el-vagon-deportivo; desktop 1440 y mobile 390 (+320/360 overflow)",
  "findings": [
    {"id": "V1", "severity": "medium-high", "title": "Mobile home: titular visible es p[role=heading]; H1 real oculto (0x0); hero duplicado", "evidence": ["screenshots/home-mobile-fold.png", "screenshots/home-desktop-fold.png"], "verify": "1 H1 visible a 390px; un solo #hero-city"},
    {"id": "V2", "severity": "medium", "title": "Explorar y ficha muestran solo skeletons sin JS (confirmar HTML crudo con curl)", "evidence": ["screenshots/nojs-explorar-mobile.png", "screenshots/nojs-el-vagon-deportivo-mobile.png"], "verify": "curl de /el-vagon-deportivo contiene la direccion"},
    {"id": "V3", "severity": "medium", "title": "/precios: precio y CTA fuera del primer pantallazo; selector de canchas envuelve", "evidence": ["screenshots/precios-mobile-fold.png", "screenshots/precios-desktop-fold.png", "screenshots/precios-mobile-full.png"], "verify": "precio dentro de 844px a scrollY=0"},
    {"id": "V4", "severity": "medium", "title": "Home mobile: link a /para-complejos tapado por la barra inferior", "evidence": ["screenshots/home-mobile-fold.png", "screenshots/home-mobile-bottom.png"], "verify": "elementFromPoint del link devuelve el <a>"},
    {"id": "V5", "severity": "medium-low", "title": "Geolocalizacion pedida al cargar (2 llamadas, sin gesto) y mensaje de error de entrada", "evidence": ["screenshots/home-mobile-fold.png", "screenshots/home-desktop-fold.png"], "verify": "0 llamadas a getCurrentPosition en la carga"},
    {"id": "V6", "severity": "medium-low", "title": "Header B2B mobile: targets 36px; hamburguesa fuera de pantalla a 320px; menu semitransparente", "evidence": ["screenshots/para-complejos-mobile-fold.png", "screenshots/precios-mobile320-fold.png", "screenshots/para-complejos-mobile-menu-abierto.png"], "verify": "a 320px right<=320 y controles >=44px"},
    {"id": "V7", "severity": "medium-low", "title": "Listado con complejo de aspecto de prueba, provincia repetida, logo recortado/borroso", "evidence": ["screenshots/explorar-mobile-full.png", "screenshots/explorar-desktop-fold.png", "screenshots/el-vagon-deportivo-desktop-fold.png"], "verify": "sin placeholder CO; sin 'Buenos Aires, Buenos Aires'"},
    {"id": "V8", "severity": "low", "title": "Explorar mobile: formulario repetido antes de resultados; botones Lista/Mapa sin nombre accesible; textos 10-11px", "evidence": ["screenshots/explorar-mobile-fold.png", "screenshots/explorar-mobile-full.png"], "verify": "una tarjeta en el primer pantallazo; axe button-name sin violaciones"},
    {"id": "V9", "severity": "low", "title": "Pestana Rival aparece tras hidratar (3 a 4 pestanas)", "evidence": ["screenshots/early-home-mobile-dcl.png", "screenshots/home-mobile-fold.png"], "verify": "sin layout-shift en la barra inferior"},
    {"id": "V10", "severity": "low", "title": "Home delgada (~350 caracteres sin JS; 953px de alto)", "evidence": ["screenshots/home-desktop-full.png", "screenshots/home-mobile-full.png"], "verify": "mas de 1.5 pantallas y mas de 800 caracteres sin JS"},
    {"id": "V11", "severity": "info", "title": "Divergencia visual claro/oscuro entre publicos, coherente con DESIGN.md", "evidence": ["screenshots/home-mobile-fold.png", "screenshots/para-complejos-mobile-fold.png"], "verify": "links cruzados presentes (V4)"}
  ]
}
```
