# 06 — Medición

**Fecha:** 2026-10-31.

**Restricción:** presupuesto $0 (D8). Hoy se mide **a mano y con herramientas gratis**. El medidor automático queda especificado en §9 y se enciende cuando haya unos USD 10-30 por mes.

## 1. Principios

1. **Se mide la frecuencia, no el puesto.** La misma lista de marcas se repite en menos de 1 de cada 100 corridas, y el mismo orden en 1 de cada 1.000. Lo estable es la cuota acumulada: en 250 preguntas correlacionó 0,994 entre febrero y septiembre de 2026 (citado en el prompt). Una sola pregunta no prueba nada.
2. **Siempre las mismas preguntas**, en el mismo orden y con la misma configuración. Si se cambia una, se versiona (v1 → v2) y no se mezclan los resultados.
3. **La línea base se mide antes de tocar el sitio** (V0). Sin línea base no hay forma de saber si algo funcionó.
4. **La ventaja de medir a mano:** Lázaro está en Argentina. Sus corridas ven lo que ve un dueño argentino, cosa que una API configurada en EE.UU. no garantiza.

## 2. El set de preguntas (v1)

Está en rioplatense. **En negrita**, las 8 del **núcleo semanal**.

| ID | Grupo | Pregunta |
|---|---|---|
| **N01** | B2B | ¿Cuál es la mejor app para la gestión de mi complejo de fútbol? |
| **N02** | B2B | ¿Qué sistema me recomendás para administrar las reservas de mis canchas de fútbol 5? |
| **N03** | B2B | Busco un software para manejar los turnos de mi predio de fútbol, ¿cuál me conviene? |
| N04 | B2B | ¿Qué programa usan los complejos de fútbol en Argentina para manejar reservas y caja? |
| N05 | B2B | Mejores sistemas de gestión para complejos de fútbol 5 en Argentina |
| **N06** | B2B | Tengo tres canchas de fútbol 5 y un buffet, y anoto todo en un cuaderno: ¿qué app me recomendás? |
| **N07** | B2B | ¿Hay alguna app gratis o barata para gestionar canchas de fútbol? |
| **R01** | Necesidad | Sistema de turnos para canchas de fútbol sin comisión por reserva |
| R02 | Necesidad | ¿Cómo hago para cobrar señas online en mi complejo de fútbol con Mercado Pago? |
| R03 | Necesidad | App para manejar turnos fijos en canchas de fútbol |
| R04 | Necesidad | ¿Cómo evito que los jugadores falten a los turnos de mi complejo? |
| R05 | Necesidad | Software para controlar la caja del buffet de un complejo de fútbol |
| R06 | Necesidad | Sistema para que los jugadores reserven la cancha online sin descargar una app |
| R07 | Necesidad | ¿Cómo cobro la cancha por equipo cuando un equipo paga y el otro no? |
| R08 | Necesidad | Bot de WhatsApp para tomar reservas de canchas de fútbol |
| **C01** | Comparación | Alternativas a ATC Sports para un complejo de fútbol |
| C02 | Comparación | ¿Vibe, CanchaFija o Clubin? ¿Cuál es mejor para un complejo de fútbol 5? |
| C03 | Comparación | ¿TurnoGol o Vibe? |
| C04 | Comparación | ¿ATC Sports o TurnoGol para un complejo de fútbol? |
| **M01** | Marca | ¿Qué es TurnoGol? |
| M02 | Marca | TurnoGol opiniones |
| M03 | Marca | ¿Cuánto cuesta TurnoGol? |
| M04 | Marca | TurnoGol vs ATC Sports |
| J01 | Jugador | ¿Dónde reservo una cancha de fútbol 5 en Luján? |
| J02 | Jugador | App para reservar canchas de fútbol 5 en Buenos Aires |

Las preguntas de otros países (Colombia, México, Chile, Perú, España, Uruguay) **no se miden todavía**: quedan en el radar.

## 3. Protocolo manual (gratis)

**Motores:**
- **Semanal:** ChatGPT **sin sesión** (ventana de incógnito), Gemini, Perplexity y Copilot.
- **Mensual, además:** ChatGPT **con** la sesión Plus (el disparador original), AI Mode de Google si está disponible desde la cuenta, Meta AI en WhatsApp y Claude.

**Configuración fija:**
- Chat nuevo cada vez y en incógnito donde se pueda.
- Sin contexto previo y sin decir quién sos.
- Copiar la pregunta tal cual.
- Si el motor ofrece "buscar en la web", dejarlo como viene por defecto y anotarlo.

**Frecuencia y tiempo:**

| Corrida | Qué | Volumen | Tiempo aprox. |
|---|---|---|---|
| Semanal | 8 preguntas del núcleo × 4 motores × 1 corrida | 32 respuestas | 40-50 min |
| Mensual (primera semana del mes) | Las 25 preguntas × 3 motores (ChatGPT sin sesión, Gemini, Perplexity) + N01, M01 y M03 en ChatGPT Plus, AI Mode, Meta AI y Claude | ~87 respuestas | ~2 h |

Con 4 corridas semanales por mes, cada pregunta del núcleo acumula 4 observaciones por motor por mes. Esa es la frecuencia que se reporta.

**Qué se anota en cada respuesta** (planilla, ver §4):
1. ¿Nombra a TurnoGol? (sí/no)
2. ¿Cita o enlaza turnogol.app? (sí/no y qué URL)
3. Competidores nombrados, en el orden en que aparecen. El orden se guarda pero no se usa como métrica.
4. URLs de terceros citadas. Es la lista de sitios donde hay que aparecer.
5. Si describe bien a TurnoGol: sí / parcial / no. "Bien" es que diga algo compatible con la frase canónica y no invente funciones.
6. Si hay confusión con TurnosGol (sí/no): precio en USD, Zeus Agencia, turnosgol.com.ar.
7. Una captura de pantalla o el link compartido de la conversación, si el motor lo permite.

## 4. Planilla

Recomendado: **Google Sheets**, que es gratis, se carga desde el celular y se exporta a CSV. La plantilla CSV la genera V0 en `docs/visibilidad-ia/medicion/plantilla-v1.csv`.

```
fecha,semana_iso,set_version,motor,sesion,pregunta_id,corrida,nombra_turnogol,cita_turnogol_app,url_turnogol_citada,competidores_en_orden,urls_terceros,descripcion_correcta,confusion_turnosgol,captura_o_link,notas
2026-11-03,2026-W45,v1,chatgpt,sin_sesion,N01,1,no,no,,"Vibe;CanchaFija;Clubin","vibe.com.ar;capterra.com/p/10045949",n/a,no,,
```

## 5. Métricas, definiciones y metas

| Métrica | Definición | Fuente |
|---|---|---|
| **Presencia** (por motor) | Respuestas que nombran a TurnoGol ÷ respuestas totales, por grupo de preguntas, en las últimas 4 semanas | Planilla |
| **Cita** | Respuestas que citan o enlazan turnogol.app ÷ total | Planilla |
| **Exactitud** | Respuestas con "descripción correcta = sí" ÷ respuestas que nombran a TurnoGol | Planilla |
| **Confusión** | Respuestas de marca (M01-M04) con "confusión = sí" ÷ respuestas de marca | Planilla |
| **Dominios de terceros** | Lista de dominios citados en N y C, con su frecuencia. Los que se repiten son los objetivos de `05-autoridad-externa.md` | Planilla |
| **Co-menciones** | Competidores que aparecen al lado, con su frecuencia | Planilla |
| Indexación | Páginas indexadas en Google y en Bing | Search Console, Bing |
| Impresiones en IA | Reporte de IA generativa de Search Console y AI Performance de Bing (citas en Copilot y grounding queries) | Search Console, Bing |
| Sesiones desde IA | Visitas con referrer chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com, claude.ai | Vercel Web Analytics |
| Trials atribuibles | Altas con "¿Cómo nos conociste? = ChatGPT u otra IA" o con referrer de IA | Base (VIS-008) |

**Metas.** Son hipótesis: se recalibran con la línea base.

| Etapa | Indicadores adelantados | Resultado |
|---|---|---|
| **0** (semanas 1-2) | Línea base completa (32 + 87 respuestas). Search Console y Bing con el sitemap procesado. Firewall confirmado. Prueba de acceso de 3 IAs | Línea base: presencia ≈ 0% esperado |
| **1** (semanas 2-6) | Las páginas de Etapa 1 indexadas en Google y Bing. turnogol.app arriba del repo de GitHub para "TurnoGol" en Google. 5 o más perfiles externos con la misma frase. 2 videos publicados | Exactitud ≥ 50% en M01-M03 en 2 de 4 motores o más. Confusión < 50% |
| **2** (semanas 6-16) | 4 comparativas + 8 funciones indexadas. 3 o más dominios de terceros que nombren a TurnoGol (sin contar los perfiles propios). 1-2 reseñas. 4 videos | Presencia ≥ 10% en el núcleo en al menos un motor. Primeras citas en Bing AI Performance |
| **3** (meses 4-12) | Herramientas e Índice publicados. 10 o más dominios de terceros | Presencia ≥ 25% en 2 motores. Trials atribuibles a IA ≥ 1 por mes |

## 6. Google Search Console (Lázaro, gratis, Etapa 0)

1. **Agregar una propiedad de dominio** `turnogol.app`, verificada por **DNS** (registro TXT donde esté manejado el DNS del dominio). Así cubre http, https, www y los subdominios.
2. **Enviar el sitemap:** `https://turnogol.app/sitemap.xml`.
3. **Inspeccionar estas URLs y pedir indexación:** `/`, `/para-complejos`, `/precios`, `/explorar`, `/el-vagon-deportivo`.
4. **Mirar cada semana** el reporte de Páginas (indexadas, excluidas y por qué) y el **reporte de IA generativa** (AI Overviews y AI Mode, solo con impresiones).
5. **NUNCA activar** el control que excluye al sitio de AI Overviews y AI Mode. Está disponible globalmente desde el 31/08/2026 y viene por defecto en "Include".
6. Cuando las fichas estén arregladas (V2), revisar con "Probar URL publicada" que el H1 se vea en el HTML renderizado.

## 7. Bing Webmaster Tools + IndexNow

- **Bing:** el sitio quedó verificado y el sitemap enviado el 31/10/2026.
  - En 1 o 2 días, chequear que el sitemap diga URLs descubiertas y 0 errores.
  - Cada semana, mirar **AI Performance**: citas en Copilot y en los resúmenes de Bing, páginas citadas y grounding queries (no trae clics). Las grounding queries son las preguntas reales con las que Copilot llega al sitio, así que alimentan el set de preguntas v2.
- **IndexNow** (VIS-014, Claude Code, gratis):
  - Un archivo de clave en `public/{clave}.txt`.
  - En cada deploy de producción, un POST a `https://api.indexnow.org/indexnow` con las URLs del sitemap cuyo `lastmod` cambió (hasta 10.000).
  - Avisa a Bing, Yandex, Seznam, Naver, Yep, Internet Archive y Amazon. **No a Google.**
  - El beneficio documentado es Copilot.

## 8. Analítica en el sitio

### 8.1 Vercel Web Analytics (Etapa 0, VIS-007)

**Por qué es el primero:**
- No usa cookies, así que no hace falta un banner.
- El script sale del mismo origen (`/_vercel/insights/*`), así que entra en la CSP actual (`script-src 'self'`, `next.config.ts:10-25`).
- Muestra referrers y páginas.

**Antes de prenderlo**, Lázaro confirma en el dashboard el plan de Vercel y el tope gratis de eventos. **No pagar.** Si el tope no alcanza, se mide solo en las páginas públicas.

**Qué mirar:**
- Visitas con referrer `chatgpt.com`, `chat.openai.com`, `perplexity.ai`, `gemini.google.com`, `copilot.microsoft.com`, `claude.ai`, `meta.ai`, `deepseek.com`, `grok.com`.
- Entre el 8 y el 15/10/2026 hubo reportes de enlaces de ChatGPT sin referrer (citado en el prompt): esas visitas caen en "directo".

**Eventos custom**, si el plan los incluye: `trial_signup_start` (clic en "Probalo"), `trial_signup_done` y `contact_whatsapp` (clic en wa.me).

### 8.2 "¿Cómo nos conociste?" (Etapa 0-1, VIS-008)

- **Dónde:** en el onboarding y **no** en `/register`, porque el panel de `/register` tiene la restricción de L3. Es un paso opcional y de un toque.
- **Opciones cerradas:**
  - Google
  - ChatGPT u otra IA
  - Instagram
  - Me lo recomendó otro complejo
  - Me escribieron de TurnoGol
  - YouTube
  - Otro
- **También se guarda** el `document.referrer` y los `utm_*` del primer aterrizaje: van en una cookie first-party de sesión y se leen en el alta.
- **Datos:** columna nueva en `tenants`, o una clave en `tenants.settings`. Lo decide la sesión de V4 con `convenciones-stack`. Si es columna, la migración nueva la aplica Lázaro.

### 8.3 GA4 [a futuro]

Solo si hace falta algo que Vercel no da. Requiere:
- Abrir la CSP a `googletagmanager.com` y `google-analytics.com`.
- Banner de consentimiento.
- Un **grupo de canales** propio "IA" arriba de Referral, con la regex de fuente `chatgpt\.com|openai|perplexity|gemini\.google|copilot\.microsoft|claude\.ai|meta\.ai|deepseek|grok`. El canal "AI Assistant" nativo (desde el 13/05/2026) subcuenta: deja afuera a Perplexity, y AI Overviews y AI Mode caen en orgánico.

## 9. Medidor automático [a futuro, ~USD 10-30 por mes]

Se enciende cuando haya presupuesto. Mientras tanto, la especificación queda lista.

### Arquitectura

```
GitHub Actions (cron semanal, repo público → minutos gratis)
  └─ scripts/visibility/run.ts  (tsx)
       ├─ OpenAI Responses API  + tool web_search
       │     user_location: { type: "approximate", country: "AR", region: "Buenos Aires", city: "Luján", timezone: "America/Argentina/Buenos_Aires" }
       │     include: ["web_search_call.action.sources"]   ← todas las URLs consultadas, aunque no se citen
       ├─ Anthropic Messages API + tool web_search (web_search_20250305)
       │     user_location: { type: "approximate", country: "AR", timezone: "America/Argentina/Buenos_Aires" }
       │     (devuelve 400 si "AR" no está soportado: probarlo en V0)
       ├─ Gemini API + Grounding with Google Search (si el free tier alcanza)
       └─ parser: menciones (TurnoGol | Turno Gol | turnogol.app | TurnosGol | competidores), orden, citas y fuentes
  └─ guarda en Postgres → tabla de sistema ai_visibility_runs (ver esquema)
  └─ genera docs/visibilidad-ia/medicion/reporte-AAAA-SS.md (o lo publica como comentario de un issue)
```

Las claves de API van como secrets de GitHub Actions, nunca en el repo. Se generan los modelos vigentes de cada proveedor en el momento de implementarlo; antes, leer la skill `claude-api` y la documentación de OpenAI.

### Esquema (Postgres, tabla de sistema sin tenant)

Lleva migración nueva y RLS habilitado sin policies para `turnogol_app`. Escribe el rol worker. Hay que seguir `convenciones-stack` y la skill de migraciones, y la migración la aplica Lázaro.

```sql
ai_visibility_runs (
  id uuid pk default gen_random_uuid(),
  run_at timestamptz not null,
  set_version text not null,          -- 'v1'
  engine text not null,               -- 'openai' | 'anthropic' | 'gemini'
  model text not null,
  question_id text not null,          -- 'N01'…
  attempt smallint not null,          -- 1..N
  location text not null,             -- 'AR/Buenos Aires/Luján'
  answer_text text not null,
  mentions_turnogol boolean not null,
  cites_turnogol_app boolean not null,
  turnosgol_confusion boolean not null,
  competitors jsonb not null,         -- [{name, position}]
  cited_urls jsonb not null,          -- [url]
  consulted_urls jsonb not null,      -- fuentes consultadas (OpenAI include)
  searches_used smallint,
  cost_usd_estimate numeric(8,4)
)
```

### Costo estimado

Hay que verificarlo al implementar: los precios de búsqueda y de tokens cambian.

| Motor | Volumen por mes | Búsquedas | Costo aprox. |
|---|---|---|---|
| OpenAI | 25 preguntas × 2 corridas × 4 semanas = 200 respuestas | ~3 por respuesta → 600 | USD 6-15 (USD 10 a 25 cada 1.000 según el modelo) + tokens |
| Anthropic | 200 respuestas | ~3-10 por respuesta (las comparativas usan 10 o más) | USD 6-20 (USD 10 cada 1.000) + tokens |
| Gemini 3 | 200 respuestas | — | USD 0 dentro de las 5.000 gratis por mes, si el tier lo permite; después USD 14 cada 1.000 |

**Total:** USD 10-35 por mes. Con solo el núcleo (8 preguntas), unos USD 5-12.

**Limitación:** la API no es la app que usa la gente. No tiene memoria ni personalización, y su recuperación puede ser otra. Sirve para ver tendencias y descubrir fuentes, y no reemplaza la corrida manual mensual.

## 10. Bots: cómo saber si entran

**Gratis, hoy:**
1. **Prueba de acceso (VIS-005).** Pedirles a ChatGPT, Claude y Perplexity: "Abrí https://turnogol.app/precios y decime cuánto cuesta por cancha". Si responden $30.000, el fetcher entra y lee el HTML.
2. **Search Console**: estadísticas de rastreo (Googlebot).
3. **Bing**: estadísticas de rastreo + AI Performance.

**[a futuro] Logs:** cruzar los logs con las listas oficiales de IPs ([OpenAI](https://openai.com/searchbot.json), [Anthropic](https://claude.com/crawling/bots.json), [Perplexity](https://www.perplexity.ai/perplexitybot.json)). Para eso hace falta un log drain de Vercel o un muestreo propio, y hoy el `matcher` del `middleware.ts` excluye a propósito `/`, `/explorar` y `/[slug]`. Si se hace, que no agregue latencia a esas rutas.

**Un spoof de user-agent con curl no prueba nada**: los firewalls chequean IP y firma. Solo sirve para descartar bloqueos por UA, cosa que ya se hizo el 30/10/2026: 200 para los 7 UAs probados.

## 11. Tablero semanal (para pegar en un doc o en Sheets)

```
Semana 2026-W__ · set v1
Presencia núcleo (4 sem.):  ChatGPT __% · Gemini __% · Perplexity __% · Copilot __%
Cita turnogol.app:           __% (núcleo)
Exactitud marca (M01-M04):   __% · Confusión TurnosGol: __%
Top 5 dominios de terceros citados: 1) ____ 2) ____ 3) ____ 4) ____ 5) ____
Competidores más co-mencionados: ____
Search Console: indexadas __ · impresiones IA __
Bing: citas Copilot __ · grounding queries nuevas: ____
Vercel: visitas desde IA __ · altas __ · "¿Cómo nos conociste? = IA": __
Qué cambió en el sitio esta semana: ____
Próxima acción: ____
```
