# Perfil de backlinks — turnogol.app

**Fecha de medición:** 2026-11-02. **Estado:** completo (segunda pasada).
**Tier de fuentes: 0.** Solo Common Crawl Web Graph y el crawler de verificación (`backlinks_auth.py --check`). No hay Moz, Bing Webmaster, Keywords Everywhere ni DataForSEO.
**Alcance:** solo lectura. Este es el único archivo escrito.

## 1. Veredicto

| Ítem | Resultado | Rating |
|---|---|---|
| Backlinks externos de terceros hacia turnogol.app que pude observar | **0** | Fail (brecha) |
| Dominios referentes medibles con fuentes gratis | **No medible** (ningún script gratis los extrae) | Sin dato |
| Presencia en Common Crawl | No está, en ninguna de las 2 releases consultadas | Warn (esperable por edad, ver §2) |
| Score de salud de backlinks (0-100) | **DATOS INSUFICIENTES** | No se emite número |
| Señales tóxicas | Ninguna observable; no evaluable sin Moz Spam Score | Sin dato |

El dominio es nuevo: según RDAP se registró el **2026-07-20** (105 días al 2026-11-02). Casi nada del perfil externo existe todavía, y eso es consistente con lo que ya dice `05-autoridad-externa.md` ("hoy ningún tercero nombra a TurnoGol"). Ninguna de las conclusiones de abajo debe leerse como "autoridad baja": es ausencia de dato, no un dato bajo.

## 2. Métricas a nivel dominio

| Métrica | Valor | Fuente y confianza |
|---|---|---|
| Fecha de registro | 2026-07-20 (vence 2027-07-20); último cambio 2026-07-31 | RDAP vía rdap.org, dato de registro (0.95) |
| En Common Crawl `cc-main-2026-jan-feb-mar` | No (`in_crawl=false`, `in_rankings=false`) | Common Crawl, nivel dominio (0.50) |
| En Common Crawl `cc-main-2026-jul-aug-sep` | No (mismo resultado) | Common Crawl, nivel dominio (0.50) |
| PageRank, Harmonic Centrality y sus rangos | Sin dato (`null`) | Common Crawl (0.50) |
| Frescura | Los web graphs de Common Crawl son trimestrales | commoncrawl.org/web-graphs |

Cómo leerlo:
- La release ene-mar 2026 es **anterior** al registro del dominio (julio 2026), así que no podía contenerlo. La de abr-jun tampoco (no existía el dominio). La de jul-sep cubre solo ~10 semanas desde el registro y no lo incluye.
- La primera release donde podría aparecer razonablemente es **oct-nov-dic 2026** (todavía no publicada al 2026-11-02; no verificado).
- Hallazgo de herramienta: `commoncrawl_graph.py --info` lista como última `cc-main-2026-jan-feb-mar`, pero `data.commoncrawl.org` responde HTTP 200 para los archivos `domain-ranks` de `cc-main-2026-apr-may-jun` y `cc-main-2026-jul-aug-sep`. Hay que pasar `--release` a mano; por defecto mide una release vieja.
- No hay DA, PA ni Spam Score: requieren Moz (no configurado). No los estimo.

## 3. Competidores del nicho (Common Crawl, release `cc-main-2026-jan-feb-mar`)

Todos con confianza **0.50** (nivel dominio, solo Common Crawl). Rango menor = más central. No son comparables con DA/DR de Moz o Ahrefs, y no son un conteo de backlinks.

| Dominio | Registrado (RDAP, 0.95) | En crawl | Rango PageRank | Rango Harmonic Centrality | Hosts vistos |
|---|---|---|---|---|---|
| turnogol.app | 2026-07-20 | No | — | — | — |
| easycancha.com | 2015-08-18 | Sí | 445.805 | **136.711** | 3 |
| dondejuegoapp.com | 2017-01-15 | Sí | 1.114.073 | 316.185 | 3 |
| ondepor.com | 2019-08-16 | Sí | 1.094.312 | 335.266 | 2 |
| atcsports.io | sin dato RDAP | Sí | 1.633.007 | 611.991 | 1 |
| alquilatucancha.com | 2016-06-08 | Sí | 8.515.511 | 8.987.753 | 2 |
| turnito.app | 2022-06-24 | Sí | 2.846.945 | 17.259.470 | 4 |
| turnito.com.ar, fulbito.com.ar, clubbi.io, clubinarg.com, turnosgol.com.ar | — | No | — | — | — |

Notas:
- La lista de Turnito rotula `atcsports.io` con el texto "Alquila Tu Cancha". Que `alquilatucancha.com` y `atcsports.io` sean la misma marca es una inferencia mía por ese rótulo, no algo que verifiqué en los sitios.
- La divergencia en turnito.app (rango PageRank 2,8 M vs. Harmonic Centrality 17,3 M) y en alquilatucancha.com no la interpreto: con una sola release y sin conteos de enlaces no hay base para explicarla.
- Los dominios "No en crawl" no son "autoridad baja": Common Crawl no los rastreó (nuevos, chicos o fuera de su muestra).
- No corrí las releases abr-jun ni jul-sep para los competidores; la tabla es de una sola release para que sea comparable.
- **Brecha medible:** no se puede calcular una diferencia numérica contra los competidores porque TurnoGol no tiene valor en ninguna release. Lo único defendible es la diferencia de edad: 105 días contra entre 4 y 11 años.

## 4. Dominios referentes encontrados

**Terceros con enlace dofollow o nofollow verificado a turnogol.app: ninguno.**

| Fuente | Qué hice | Resultado | Fuente y confianza |
|---|---|---|---|
| `turnito.app/blog/las-mejores-apps-de-reservas-para-clubes-en-argentina-2026/` | Crawler de verificación + búsqueda de texto "turnogol" en el HTML | HTTP 200, sin enlace ni mención | Verify (0.95) |
| `clubbi.io/recursos/mejores-software-clubes-deportivos-argentina` | Ídem | HTTP 200, sin enlace ni mención | Verify (0.95) |
| `clubinarg.com/comparativa-software-clubes-argentina` | Ídem | HTTP 200, sin enlace ni mención | Verify (0.95) |
| `instagram.com/turnogol/` | Crawler de verificación | `unverifiable_js` (no confirmable por GET) | Verify (sin veredicto) |
| SERP de marca en Bing (`turnogol.app`, 1 página, 2026-11-02) | Scrape con `render_page.py` | Solo aparecen páginas propias (`/ingresar`, `/register`, `/explorar`, `/para-complejos`, `/precios`), el perfil de Instagram (el snippet dice 842 seguidores, 259 seguidos) y una publicación de Instagram. Ningún artículo ni directorio de terceros | Scrape de SERP, confianza baja (0.30): una consulta, una página, sin conteo de índice |

Sobre la SERP:
- Las consultas con operador `-site:` o genéricas (por ejemplo "mejores sistemas de gestión para canchas de fútbol Argentina") devolvieron resultados vacíos o basura (Gemini, Wikipedia, foros), así que **no las uso** como evidencia. DuckDuckGo devolvió un CAPTCHA.
- Los enlaces salientes propios de la home son solo `wa.me/5492323346976` e `instagram.com/turnogol` (ambos con `rel="noopener noreferrer"`). La ficha de El Vagón suma Google Maps y el WhatsApp del complejo. Fuente: parseo propio del HTML (0.95).

## 5. Anchor text

- **Anchors entrantes de terceros: sin datos**, porque no hay enlaces entrantes observables. No inferí distribución ni naturalidad.
- Dato útil del nicho (Verify, 0.95): la lista de Turnito enlaza a sus competidores con **anchor de marca exacta** ("Alquila Tu Cancha", "EasyCancha", "OnDepor", "DondeJuego") y con **`rel="nofollow"`** en los cuatro. Sus propios enlaces internos y a Turnito van sin nofollow. Consecuencia: aunque una lista de un competidor incluya a TurnoGol, el valor esperado es **mención de marca**, no transmisión de PageRank.
- Para Clubbi y Clubin no medí el atributo `rel` de los enlaces a competidores (no lo extraje).
- Por el patrón anterior, el anchor que conviene pedir es la marca ("TurnoGol"), no frases con keyword.

## 6. Señales tóxicas

| Señal | Hallazgo | Confianza |
|---|---|---|
| Enlaces entrantes spam o de baja calidad | No hay enlaces entrantes observables, así que no hay nada tóxico para medir | Verify (0.95) sobre las 3 páginas verificadas; no cubre el resto de la web |
| Spam Score | Sin dato (requiere Moz) | — |
| Ratio tóxico | No calculable | — |

Riesgos de **entidad** (no de enlaces), observados en la SERP de marca de Bing:
- **`turnosgol.com.ar`** ("TurnosGol | Sistema de Reservas y Gestión para Canchas de Fútbol"): un producto casi idéntico en nombre y propuesta (reservas 24/7, seña con Mercado Pago, turnos fijos, finanzas) que aparece al lado de TurnoGol para la búsqueda de marca. Menciones sin link a "TurnosGol/TurnoGol" pueden confundirse. Esto es una **inferencia de riesgo**, no una medición.
- `tirogol.com` (portal de noticias deportivas): homónimo parcial, sin relación aparente.
- Common Crawl (ene-mar 2026): `turnosgol.com.ar` figura como "No en crawl"; `tirogol.com` no lo medí.

## 7. Score de salud de backlinks

**DATOS INSUFICIENTES.** Con Tier 0 solo hay datos a nivel dominio de Common Crawl (y ni eso para TurnoGol). Factores de la rúbrica:

| Factor (peso) | Estado |
|---|---|
| Dominios referentes (20%) | Sin dato (requiere Moz o DataForSEO) |
| Distribución de calidad de dominios (20%) | Sin dato |
| Naturalidad del anchor (15%) | Sin dato |
| Ratio tóxico (20%) | Sin dato |
| Velocidad de enlaces (10%) | Sin dato (solo DataForSEO) |
| Follow/nofollow (5%) | Sin dato |
| Relevancia geográfica (10%) | Sin dato |

0 de 7 factores puntuados. Emitir un número sería engañoso (regla de Tier 0: menos de 4 factores = no hay score).

## 8. Brechas y oportunidades

Prioridad: Crítica > Alta > Media > Baja. Todas a $0 (decisión D8). El plan operativo ya está en `05-autoridad-externa.md`; abajo solo lo que esta medición agrega o corrige.

| Prioridad | Hallazgo | Acción |
|---|---|---|
| **Alta** | **No hay forma gratis de medir dominios referentes con las fuentes actuales.** Para saber cuántos dominios enlazan realmente hace falta una fuente de enlaces. | Verificar `turnogol.app` como propiedad en **Google Search Console** (informe "Enlaces", exporta enlaces externos, gratis) y en **Bing Webmaster Tools** (gratis; da la clave de API para pasar a Tier 2 y habilita `bing_webmaster.py links`). Es el primer paso para tener una línea base real. |
| **Alta** | Cero menciones o enlaces en las 3 listas de software que posicionan en el nicho (Turnito, Clubbi, Clubin). Verificado hoy con crawler y búsqueda de texto. | Plantilla P3 de `05` (§6). Expectativa: en Turnito el enlace sería `nofollow` y de marca exacta, así que el beneficio es mención, no PageRank. Re-ejecutar `verify_backlinks.py` contra cada URL a las 4 semanas para confirmar inclusión. |
| **Alta** | Entidad ambigua con `turnosgol.com.ar` en la búsqueda de marca. | Pedir siempre el anchor "TurnoGol" y la URL `turnogol.app` completa en toda mención; usar la misma frase corta en todos los perfiles. Monitorear la SERP de marca mensualmente. |
| **Media** | El JSON-LD `Organization` de la home **no tiene `sameAs`** (verificado en el render del 2026-11-02: la cadena no aparece en el HTML). Instagram es el único perfil propio visible. | Agregar `sameAs` a medida que existan perfiles (VIS-015 en `05`). Los enlaces de perfil (Instagram, LinkedIn, G2) suelen ser `nofollow` o sin link: sirven como señal de entidad, no como PageRank. La memoria del proyecto dice que la ficha G2/Capterra está aprobada desde el 30/10, pero no la verifiqué ni conozco su URL. |
| **Media** | Hay solo 2 complejos públicos (`/el-vagon-deportivo`, `/complejo-evardss`; 2 en `/explorar`). Cada complejo es un posible referente (su Google, su Instagram, su WhatsApp). | Seguir el punto 5 de `05` (plantilla P1). Su efecto es sobre menciones y tráfico de referido; su valor de PageRank es incierto y no lo medí. |
| **Media** | Los competidores con más centralidad (easycancha.com, dondejuegoapp.com, ondepor.com) reciben enlaces editoriales aunque sean `nofollow`: aparecen en la lista de Turnito. | Considerar a **OnDepor y DondeJuego** (y no solo ATC y EasyCancha) como competidores en el seguimiento de la SERP y de las listas. |
| **Baja** | Common Crawl no tendrá a TurnoGol hasta una release posterior a oct 2026. | Re-correr `commoncrawl_graph.py turnogol.app --release <nueva>` cuando salga la de oct-nov-dic 2026 (no verificado que esté publicada). |
| **Baja** | Activos enlazables hoy: `/blog/mejores-sistemas-gestion-canchas-futbol-argentina-2026` (en el sitemap), `/precios`, `/explorar`. | Solo tienen sentido para promover con un dato propio (el Índice de precios de `05` §8), no para pedir enlaces sin más. |

Fuera de alcance de este análisis: crawlabilidad y estructura (`/seo technical https://turnogol.app`) y E-E-A-T (`/seo content https://turnogol.app`). Un detalle para ese análisis: Bing lista `/ingresar?next=%2Findex` y `/register` en su índice pese a que `robots.txt` bloquea `/ingresar`; no lo investigué.

## 9. Lo que no pude medir

- Dominios referentes, backlinks totales, anchors, follow/nofollow y velocidad de enlaces de **turnogol.app** (sin Moz/Bing/DataForSEO).
- Los mismos datos para los competidores: solo hay rangos de Common Crawl, que no son conteos de enlaces.
- Enlaces desde redes sociales o grupos cerrados (Instagram, WhatsApp, Facebook): no verificables por GET.
- Clubbi y Clubin: atributo `rel` hacia competidores.
- Cobertura de la búsqueda: un solo scrape de Bing de una consulta de marca. No es un conteo de índice.

## 10. Validación

`validate_backlink_report.py` (datos de Common Crawl ene-mar + crawler de verificación): **PASS**, 0 errores, 0 advertencias, 1 info ("dominio no encontrado en Common Crawl: no interpretar como autoridad baja"), coherente con este informe.
Chequeos manuales: cada cifra lleva fuente y confianza; las inferencias están marcadas como inferencias (ATC/atcsports.io, riesgo de entidad con turnosgol.com.ar); no se afirma plataforma ni se infiere nada del HTML de terceros más allá de lo observado.

## 11. Hallazgos estructurados (para `audit-data.json`, categoría Backlink Profile)

```json
{
  "category": "backlink_profile",
  "tier": 0,
  "date": "2026-11-02",
  "health_score": null,
  "health_score_status": "INSUFFICIENT_DATA",
  "factors_scored": 0,
  "factors_total": 7,
  "domain": {
    "name": "turnogol.app",
    "registered": "2026-07-20",
    "age_days": 105,
    "commoncrawl": {
      "releases_checked": ["cc-main-2026-jan-feb-mar", "cc-main-2026-jul-aug-sep"],
      "in_crawl": false,
      "in_rankings": false,
      "confidence": 0.50
    }
  },
  "referring_domains_verified": 0,
  "third_party_pages_verified": [
    {"url": "https://turnito.app/blog/las-mejores-apps-de-reservas-para-clubes-en-argentina-2026/", "links_to_target": false},
    {"url": "https://www.clubbi.io/recursos/mejores-software-clubes-deportivos-argentina", "links_to_target": false},
    {"url": "https://clubinarg.com/comparativa-software-clubes-argentina", "links_to_target": false}
  ],
  "toxic_signals": [],
  "entity_risks": ["turnosgol.com.ar (nombre casi idéntico, mismo nicho)"],
  "issues": [
    {"severity": "high", "id": "BL-01", "title": "Sin fuente de enlaces entrantes (falta GSC y Bing Webmaster verificados)"},
    {"severity": "high", "id": "BL-02", "title": "0 menciones en las 3 listas de software del nicho"},
    {"severity": "high", "id": "BL-03", "title": "Ambigüedad de marca con turnosgol.com.ar"},
    {"severity": "medium", "id": "BL-04", "title": "Organization JSON-LD sin sameAs"}
  ],
  "competitors_commoncrawl_harmonic_rank": {
    "easycancha.com": 136711,
    "dondejuegoapp.com": 316185,
    "ondepor.com": 335266,
    "atcsports.io": 611991,
    "alquilatucancha.com": 8987753,
    "turnito.app": 17259470
  }
}
```
