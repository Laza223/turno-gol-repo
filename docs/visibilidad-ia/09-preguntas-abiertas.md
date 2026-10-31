# 09 — Preguntas abiertas

**Fecha:** 2026-10-31. Cada pregunta tiene el **supuesto** con el que el plan sigue mientras tanto.

**Ya respondidas el 30 y 31/10/2026** (están en `02-estrategia.md` §2):
- Home híbrida (D1).
- Comparativas agresivas (D3).
- Sin nombre propio (D4).
- Precio intacto (D5).
- Axxen (D6).
- Repo público + secret scanning (D7).
- Presupuesto $0 (D8).

## Bloquean algo de las próximas 2 semanas

| # | Pregunta | Bloquea | Supuesto mientras tanto |
|---|---|---|---|
| P1 | ¿Complejo Evardss es cliente activo (está en prueba y usándolo) o solo una cuenta creada? ¿El Vagón acepta que se publique su nombre, un testimonio o algún número (por ejemplo, reservas online del mes)? | VIS-025, VIS-036 y cualquier prueba social | Evardss no es cliente activo. **No hay permiso** para publicar nada de El Vagón. El plan no usa testimonios ni métricas de clientes. |
| P2 | ¿Search Console ya está verificado para turnogol.app? ¿Dónde se maneja el DNS del dominio (Vercel, Cloudflare en modo DNS, el registrador)? | VIS-002 | No está verificado. El DNS se maneja donde se compró el dominio. |
| P3 | ¿En qué plan de Vercel está el proyecto (Hobby o Pro) y cuál es el tope gratis de Web Analytics? | VIS-007 | Hobby. Si el tope no alcanza, se mide solo en las páginas públicas. |
| P4 | ¿OK para corregir los claims del panel de `/register` ("Cobros automáticos con MercadoPago", "menos de 2 minutos", "Tu primera reserva puede llegar esta semana")? Hoy L3 dice "no se toca sin OK". | VIS-023 (V4) | Sí, con el texto de VIS-023. |
| P5 | ¿Qué tiene que decir `/precios` sobre los datos al vencer la prueba? Hoy promete "60 días". La decisión `2026-10-22-solo-lectura-al-vencer-la-prueba.md` fija 14 días de solo lectura y deja la retención como REQUIERE INPUT. | VIS-018 (V3) | Se saca "60 días". Queda "Si no seguís, tu cuenta queda en solo lectura 14 días para que exportes tus datos". |
| P6 | Resultado de la búsqueda en el INPI. ¿Está registrada o solicitada "TurnoGol"? ¿Aparece "TurnosGol"? | VIS-024, estrategia de entidad | No está registrada. |

## Bloquean la Etapa 1 o 2

| # | Pregunta | Bloquea | Supuesto mientras tanto |
|---|---|---|---|
| P7 | ¿Se puede nombrar RIVAL en `/para-complejos` y en `/funciones/rival` como "Ya disponible"? El flag está prendido desde el 29/10 y solo hay un día de uso. | VIS-017, VIS-032 | Sí, solo con lo marcado "Ya disponible" en `docs/rival/landing.md`. Nada de la etapa D. |
| P8 | ¿Cuánto sale hoy un turno de fútbol 5 en El Vagón en horario pico? Hace falta para el ancla "Lo que te deja un turno, una vez al mes" (¿$30.000 por cancha es menos que un turno?). | VIS-017, VIS-018 | El ancla queda como está hoy en `/precios`, sin cifra nueva. |
| P9 | ¿Desde qué fecha rige el precio de $30.000 por cancha (la que va como "vigentes desde")? ¿El 20/10/2026 o el día en que se aplicó la migración 095 en producción? | VIS-018 | El día en que se aplicó la 095, a confirmar en el deploy. |
| P10 | ¿La Fábrica puede generar tutoriales con capturas reales del panel (cuenta demo, sin datos de clientes reales)? | VIS-035 | Sí, con una cuenta demo sembrada. |
| P11 | ¿Plus se muestra en `/precios` con el precio de lista de $20.000 por cancha, o preferís "consultanos" mientras tenga un solo cliente? | VIS-018 | Se muestra con el precio de lista y como opcional. |

## A futuro (cuando haya plata o tiempo)

| # | Pregunta | Supuesto |
|---|---|---|
| P12 | Orden de compra cuando aparezcan los primeros pesos | 1) turnogol.com.ar (barato, defensivo) → 2) medidor automático con solo el núcleo (USD 5-12 por mes) → 3) consulta con un abogado de marcas → 4) una sola herramienta paga de medición. |
| P13 | ¿Pasar el repo a privado recortando el CI (VIS-057)? | Queda público hasta que lo decidas. |
| P14 | ¿Revisión legal de las comparativas antes de publicarlas? | No, por decisión del 30/10. Se publican con datos que tienen fuente y fecha, y se corrige si alguien reclama. |

## Agregadas tras la revisión independiente (31/10/2026)

| # | Pregunta | Bloquea | Default si no contestás |
|---|---|---|---|
| P15 | La decisión del 21/10 dice que la ficha `/[slug]` "no se toca" (sigue en La Reserva). VIS-011 y VIS-026 la tocan: streaming, bloque "Cómo se reserva acá", pie "Reservas con TurnoGol" y noindex. ¿Va como excepción escrita? VIS-009 la registra junto con la enmienda de L3 (`2026-09-27`) y la reversión del veto a la "banda de dueños" que implica D1. | VIS-011, VIS-026 (V2) | Sí para streaming y noindex (no cambian lo visual). El bloque y el pie esperan tu OK con captura. |
| P16 | Si una semana no llegás a las 3 h, ¿qué se cae primero? | Calendario de `04` | Se cae en este orden: LinkedIn (VIS-038) → alianzas (VIS-039) → videos (VIS-035). Nunca se cae la medición semanal de V0 ni el pedido del link a El Vagón. |

Pendientes de forma que dejó la revisión y no cambian el plan: alinear semanas y rangos de etapa entre `03` y `04`, sumar al diagrama las aristas faltantes y sacar los autolazos, que IndexNow (VIS-014) necesita un workflow nuevo sobre `deployment_status`, y que los eventos custom de Vercel Analytics dependen del plan (Hobby es de uso no comercial: confirmarlo en VIS-007).

## Notas de esta sesión que conviene saber

- El informe de investigación citado en el prompt ("Visibilidad en buscadores e IA TurnoGol.md") **no está en el repo** ni en Descargas, Escritorio o Documentos. Si lo tenés, guardalo en esta carpeta: las cifras marcadas "(prompt)" quedarían con su URL original.
- `docs/marketing/01-estrategia-contenido.md`, que citan `docs/gtm/09-contenido.md` y `10-playbook-ia.md`, **no existe**. Este plan pasa a ser la estrategia de contenido vigente para la web.
- `docs/gtm/10-playbook-ia.md` y `docs/gtm/07-objeciones.md` tienen precios y prohibiciones viejos (bandas con IVA, "sale menos que ATC"). Queda fuera del alcance de esta sesión. Conviene actualizarlos en una sesión de GTM.
