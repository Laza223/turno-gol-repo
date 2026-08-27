# La CSP se queda con `script-src 'unsafe-inline'` — riesgo aceptado, con condiciones de reapertura

**Fecha**: 2026-08-27
**Estado**: aceptado (M-10 degradado de 🟡 a 🟢)
**Contexto**: M-10 de `docs/audit/2026-08-25-auditoria-infra.md` — intento y revert en §21, decisión en §22.3

## Lo que se intentó, y por qué se revirtió

Reemplazar `'unsafe-inline'` por un nonce por request generado en
`middleware.ts`, con `'strict-dynamic'`. Dos rondas de revisión adversarial con
contexto fresco encontraron dos problemas reales, en este orden:

1. El hash SHA-256 que permitía el único script inline propio (el de
   next-themes, que evita el parpadeo de tema) **no coincidía con el script
   real**. Turbopack no reutiliza el bundle pre-minificado de
   `node_modules`: lo vuelve a bundlear con su propio minificador. Tres formas
   de calcular ese hash —a mano, con `react-dom/server`, y contra un build real—
   dieron **tres hashes distintos**. Solo el tercero sirve.
2. Con el hash ya corregido: **React no hidrata en ninguna página
   estática/SSG/ISR**. La documentación de Next.js lo dice explícito — los
   nonces se inyectan en SSR dinámico, nunca en páginas generadas en build
   time, porque ahí no existe request ni response. Medido con Chrome real:
   `/precios` acumula 18 violaciones de CSP (chunks y scripts de hidratación
   bloqueados) y `window.next` da `false`. La página queda HTML sin
   interactividad. Alcanzaba a la landing, `/login` e `/ingresar`.

O sea: el remedio era **peor que la enfermedad**.

## La pregunta que faltaba hacerse

Antes de elegir entre las arquitecturas alternativas, había una pregunta más
básica sin responder: **¿cuánto riesgo real cubre ese `unsafe-inline`?** Se
relevó la superficie de XSS completa, con archivo y línea:

- **3 `dangerouslySetInnerHTML` en todo `src/`**. Dos con datos constantes del
  código. El tercero (`JsonLd.tsx`) sí serializa datos de complejo que vienen
  de la DB — pero `escapeForScriptTag` (`src/lib/seo/structured-data.ts`) ya
  neutraliza `<`, `>`, `/`, U+2028 y U+2029 justamente para matar un
  `</script>` embebido. El threat-model está escrito en ese mismo archivo.
- **Sin campo de URL libre en el schema.** Teléfono y WhatsApp pasan por
  `telHref`/`buildWhatsappUrl`, que hacen `.replace(/\D/g, '')`: un
  `javascript:alert(1)` guardado ahí queda reducido a sus dígitos.
- **Todo el texto libre visible a terceros** (nombre y descripción del
  complejo, reseñas de jugadores, nombres de equipo del portal público de
  torneos) sale por interpolación JSX, que React escapa. Cero `innerHTML`,
  `document.write`, `eval` o `new Function` en el repo.
- **Ninguno de los 39 route handlers** devuelve `text/html`.

**Sin superficie de explotación práctica.** `'unsafe-inline'` es hoy una
debilidad de defensa en profundidad, no un agujero activo.

## La decisión

Aceptar el riesgo y bajar M-10 a 🟢, en vez de pagar el costo (roto o frágil)
de las tres alternativas que quedaban:

| Alternativa | Costo |
|---|---|
| `experimental.sri` / CSP por hash para todo script propio | Misma fragilidad que ya mordió con next-themes: cada cambio del bundler invalida los hashes en silencio, y ni el test unitario ni el e2e lo detectan |
| `force-dynamic` en las rutas públicas | Pierde ISR/SSG. El portal de torneos usa ISR 300s a propósito |
| Nonce solo donde ya es dinámico | Exige mantener a mano una lista de qué rutas son estáticas. Equivocarse rompe una página en producción, y CI no lo ve |

## Condiciones de reapertura

Esto **deja de ser aceptable** —y la conversación de arquitectura se reabre con
la evidencia ya juntada— si pasa cualquiera de las dos:

1. Se agrega un **campo de URL libre** editable por el complejo (ej. "sitio
   web del complejo"), sin sanitizador de esquema.
2. Se agrega un **`dangerouslySetInnerHTML` nuevo** con datos que no sean
   constantes del código, sin la disciplina de escapado de
   `structured-data.ts`.

## Lo que no puede verificar la suite actual

Ninguno de los dos problemas del intento revertido lo hubiera detectado CI:
el test unitario de CSP valida el string en aislamiento, y `pnpm test:e2e`
corre contra `pnpm dev`, donde la CSP mantiene `'unsafe-inline'` — **la rama de
producción nunca se ejercita**. Cualquier reintento futuro tiene que
verificarse contra un `pnpm build && pnpm start` real con un browser real.
