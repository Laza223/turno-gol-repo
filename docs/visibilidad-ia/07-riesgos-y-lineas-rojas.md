# 07 — Riesgos y líneas rojas

**Fecha:** 2026-10-31.

**Criterio:** lo legal y lo de políticas va como **riesgo con mitigación**, no como freno (D3, decisión de Lázaro del 30/10). La regla práctica es una sola: **ser agresivo con datos verdaderos y fechados; lo que se inventa es lo único que pierde**. Pierde porque las IAs no lo citan y porque es lo único que un competidor puede usar en contra.

## 1. Riesgos

Escalas: P = probabilidad, I = impacto, cada una alta, media o baja.

### Marca y entidad

| Riesgo | P | I | Mitigación | Tarea |
|---|---|---|---|---|
| **El repo público sale primero para "TurnoGol" y expone precios internos y nombres de clientes.** Una IA que busque "TurnoGol precios" puede leer el precio especial de un cliente. | Alta (ya pasa) | Alto | Prender secret scanning y push protection. Desde ahora, ningún PR ni commit lleva nombres de clientes ni precios especiales en el título o la descripción. Que turnogol.app suba por encima del repo con las tareas de entidad (V3). Privado + recorte del CI queda en el radar. | VIS-000, VIS-057 |
| **Confusión con TurnosGol** (turnosgol.com.ar, mismo nicho, una letra de diferencia). | Alta | Alto | Las reglas de consistencia de `02-estrategia.md` §7. Punto de control el 01/02/2027 con un criterio medible. No nombrarlos ni compararse con ellos en la web. | VIS-024, V0 |
| **La marca no está registrada en el INPI** (supuesto) y TurnosGol podría registrar algo parecido. | Media | Alto | Búsqueda gratis en el portal del INPI (clases 9, 35, 41 y 42). Con plata, consulta a un abogado de marcas y solicitud [a futuro]. | VIS-024 |
| **Axxen describe a TurnoGol con otras palabras** ("plataforma SaaS"). | Media | Bajo | Alinear el texto de Axxen a la frase canónica. No mencionar Axxen en TurnoGol (D6). | VIS-021 |
| **Alguien registra turnogol.com.ar.** | Baja | Medio | Registrarlo cuando haya plata (es barato). | VIS-056 |

### Legal (Argentina)

Los artículos se citan como los trae el prompt (DNU 274/2019 y Ley 24.240). **No los re-verifiqué con un abogado.**

| Riesgo | P | I | Mitigación | Tarea |
|---|---|---|---|---|
| **Publicidad comparativa** (art. 15 del DNU 274/2019, según el prompt, no verificado): lícita si compara de forma objetiva características esenciales y comprobables, sin inducir a error, sin desacreditar y sin aprovechar la marca ajena. Cualquier alusión a un competidor ya cuenta como comparativa. | Media | Medio (cese, cautelar, multa) | Cada dato del competidor va con su fuente y fecha ("según su web al DD/MM/AAAA"). Tabla con hechos, no adjetivos. Sección "cuándo conviene el otro". Sin logos ajenos. Aclaración de no afiliación. Se revisa cada trimestre o cuando cambian sus precios. Revisión de un abogado: **opcional, decide Lázaro** [a futuro]. | VIS-030, VIS-031 |
| **Publicidad engañosa** (art. 11) y **denigración** (art. 10). Hoy ya están publicados: "60% de las canchas", EasyCancha "el más caro", ATC te deja "atrapado", TurnoGol "muy accesible". | Alta (ya pasa) | Medio | Despublicarlos ya: hotfix de V1. | VIS-006 |
| **Lo prometido obliga** (Ley 24.240, art. 8). `/precios` promete "60 días de datos", "cierre diario" y "20 minutos". `/register` promete "Cobros automáticos". | Alta | Medio | Corregir en V3 y V4. | VIS-018, VIS-023 |
| **Ley 25.326 (datos personales).** Publicar nombres, métricas o testimonios de clientes sin permiso, o datos de jugadores. | Media | Alto | Solo con permiso escrito del complejo. Nunca datos de jugadores. Nada de texto libre sobre personas (veto de producto). | `09` P1 |

### Políticas de plataformas

| Riesgo | P | I | Mitigación |
|---|---|---|---|
| **Spam de Google: contenido a escala y doorways** (páginas casi iguales por ciudad o por tipo). | Media si se hace mal | Alto (afecta todo el sitio) | Sin páginas de ciudad hasta tener 3 o más complejos activos con datos reales. `/para/*` solo con contenido propio de verdad. `/funciones/*` con contenido único por operación. |
| **Listas autopromocionales.** Desde enero de 2026 se reportaron caídas de 30% a 50% en SaaS con listas propias, aunque la evidencia está en disputa (citado en el prompt). | Media | Medio | Una sola guía de "cómo elegir", con criterios, que no se pone primera y declara que la escribe TurnoGol. Se borra el post "1. TurnoGol". |
| **Manipulación de respuestas de IA:** texto oculto, instrucciones para IAs o botones "Resumir con IA" que plantan instrucciones. Las políticas de spam lo cubren desde el 15/05/2026. | Baja (no se hace) | Alto | Línea roja (§2). |
| **Reseñas fuera de regla** (G2, Capterra, Google, Trustpilot). | Baja | Alto (baja la ficha) | El mismo mensaje a todos, sin filtrar, sin redactar la reseña y declarando el vínculo (`05` §2). |
| **Enlaces en pies o widgets de clientes cargados de keywords.** | Baja | Medio | Crédito "Reservas con TurnoGol" solo, con `nofollow` si es un widget. |

### Producto y claims

| Riesgo | P | I | Mitigación |
|---|---|---|---|
| **Prometer funciones C/D** en las páginas nuevas: cobro automático de los fijos, recordatorios por WhatsApp, RIVAL etapa D (rankings, clubes), torneos, reembolso automático, "te traemos jugadores". | Media | Alto (churn, art. 8, IA que describe mal) | Cada brief lista el estado de cada función. La revisión independiente busca esas frases (grep en la verificación de cada V). Lista completa en `02-estrategia.md` §3. |
| **Plus vendido como "incluido" o "24/7 solo".** | Media | Medio | En `/precios` va como línea aparte. "Pasa a una persona y se calla 6 h si contestás vos." |
| **RIVAL vendido como lo que todavía no es.** | Media | Medio | Solo lo marcado "Ya disponible" en `docs/rival/landing.md`. No usar "Falta Uno" (es marca de un competidor). |
| **El precio comparado nos deja como los más caros** en la tabla (3 canchas: $90.000 contra $18.000 a $45.000). | Alta | Medio | El precio no se toca (D5). La tabla muestra también "cargo al jugador", "comisión", "solo fútbol", "cobro por equipo" y "fijos". La calculadora de faltazos usa los números del dueño. |

### Ejecución

| Riesgo | P | I | Mitigación |
|---|---|---|---|
| **Una sola persona y $0.** La medición la corre Claude (D14), pero un motor puede pedir login o CAPTCHA. | Media | Alto (sin medición no hay aprendizaje) | Claude no resuelve CAPTCHAs ni inicia sesión: anota "no medible sin sesión" y mide en los demás. **Mínimo innegociable**: N01 + M01 en dos motores por semana. |
| **El plan no trae las 30 pruebas en semanas.** La visibilidad en IA tarda de semanas a meses, y la memoria de los modelos, años. | Alta | Alto | Decirlo claro (`00`). El canal de corto plazo sigue siendo founder-led (`docs/gtm/`). Este plan suma desde la Etapa 1. |
| **Depender de un solo cliente para las pruebas** (El Vagón). | Alta | Alto | No pedirle reseñas antes de que active el plan. El primer pedido es el del link en su perfil de Google, que le suma reservas. |
| **Sesiones de Claude Code que se pisan** (worktrees, ramas). | Media | Medio | Una V por sesión y en su worktree. Cada prompt de `08` lo dice. |
| **Las comparativas quedan viejas** si un competidor cambia el precio. | Alta | Medio | Revisión trimestral con una fecha visible honesta y un recordatorio en el calendario. |

### Técnico

| Riesgo | P | I | Mitigación |
|---|---|---|---|
| **Sacar `loading.tsx` de las fichas rompe el 404 real**: hay un gotcha conocido de `loading.tsx` que convierte `notFound()` en soft-404, también el de un ancestro. | Media | Alto | El gate de existencia queda en `[slug]/layout.tsx:29-37`. Test e2e de un slug inexistente → 404 con curl. Leer las memorias "loading.tsx y notFound" y "loading de ancestro" antes de tocar. |
| **Cambiar `robots.ts` deja afuera algo público o abre algo privado.** | Baja | Alto | Test unitario con slugs de prueba (`canchas-el-potrero` permitido, `/caja` bloqueado) y verificación con curl en el preview. |
| **Agregar slugs reservados choca con un complejo existente.** | Baja | Medio | Antes, Lázaro hace un SELECT de solo lectura de los slugs actuales. El test de sincronía de `RESERVED_SLUGS` ya existe. |
| **Vercel Web Analytics supera el tope gratis.** | Media | Bajo | Confirmar el plan y el tope antes de activarlo. Si no alcanza, medir solo las páginas públicas. |
| **Las redirecciones 301 rompen enlaces del sitemap.** | Baja | Medio | Sacar las URLs viejas del sitemap en el mismo PR y verificar con curl que todas respondan 308 o 301 hacia la nueva. |

## 2. Líneas rojas

Ajustadas a las decisiones del 30 y 31/10/2026. No se cruzan aunque parezcan rendir.

1. **Nada de reseñas falsas**, compradas, de conocidos sin aclarar el vínculo ni pedidas solo a los satisfechos.
2. **Nada de texto oculto**, instrucciones para IAs escondidas, cloaking (otro contenido para los bots) ni botones "Resumir con IA" que planten instrucciones.
3. **Nada de páginas masivas generadas con IA** sin valor propio, doorways por ciudad, compra o intercambio de links, ni keywords en pies o widgets de clientes.
4. **Ningún número inventado.** Los superlativos ("el mejor") no se publican como eslogan: se demuestran con tablas. **Agresividad sí, invención no.**
5. **Las comparativas llevan datos con fuente y fecha.** Se nombra al competidor con nombre y apellido; no se lo insulta.
6. **No bloquear** GPTBot, OAI-SearchBot, ClaudeBot, Claude-SearchBot, PerplexityBot ni Google-Extended. **No activar** el opt-out de IA de Search Console. **No cambiar fechas** sin cambios reales.
7. **No crear una ficha de Google Business para TurnoGol** con una dirección inventada.
8. **No publicar métricas, nombres ni testimonios de clientes** sin su permiso.
9. **No prometer funciones en estado C o D** (`02-estrategia.md` §3).
10. **No nombrar a Lázaro en la web** (D4) **ni mencionar Axxen en TurnoGol** (D6).
11. **No poner nombres de clientes ni precios especiales** en títulos o descripciones de PRs y commits: el repo es público (D7).

## 3. Lo más probable que falle y el plan B

| Lo que puede fallar | Señal | Plan B |
|---|---|---|
| A las 6 semanas, la presencia en el núcleo sigue en 0% en todos los motores | Planilla | Mirar qué dominios de terceros citan las IAs en N01 a N07 y apuntar todo el esfuerzo fuera del sitio a aparecer **ahí** (`05` §1 y §6). Ningún tercero nos nombra, así que la IA nunca llega a leer `/precios`. |
| Las fichas siguen invisibles para los bots después de V2 | Prueba de acceso (VIS-005) en una ficha | Renderizar la ficha 100% estática y sacar la disponibilidad a un componente cliente aislado. |
| Lázaro no llega a medir | 2 semanas seguidas sin datos | Pasar al mínimo innegociable (N01 + M01 en 2 motores). Encender el medidor automático solo con el núcleo (~USD 5-12 por mes) apenas haya plata. |
| La confusión con TurnosGol no baja | Punto de control del 01/02/2027 | La decisión de cambiar el nombre, con datos. La toma Lázaro. |
| G2 o Capterra no aceptan la ficha o la ponen en una categoría equivocada | Respuesta del alta | Pedir el cambio de categoría. Apostar por YouTube y LinkedIn, que no dependen de un tercero. |
