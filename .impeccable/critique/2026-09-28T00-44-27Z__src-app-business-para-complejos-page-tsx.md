---
target: /para-complejos
total_score: 16
max_score: 24
na_heuristics: 5,7,9,10
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\Lazar\\Documents\\github\\TurnoGol\\src\\app\\(business)\\para-complejos\\page.tsx"
target_fingerprint: "sha256:f7ee43de1b1c440fd246deefd1bf6b96272a16e033e51acccd3fb8ffa98bc1cd"
target_path: "C:\\Users\\Lazar\\Documents\\github\\TurnoGol\\src\\app\\(business)\\para-complejos\\page.tsx"
timestamp: 2026-09-28T00-44-27Z
slug: src-app-business-para-complejos-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser), dos subagentes Sonnet aislados.

## Design Health Score (Persuade; n/a: 5, 7, 9, 10)
| # | Heurística | Score | Hallazgo |
|---|---|---|---|
| 1 | Estado del sistema | 3 | hover/foco consistentes |
| 2 | Lenguaje del usuario | 3 | "partidos fijos" vs canónico "turnos fijos" |
| 3 | Control y libertad | 3 | sin trampas |
| 4 | Consistencia | 1 | H1 = eslogan de Korus; "20 min" vs "2 min" de /register; grilla 60 min vs 15 min en la misma página |
| 5 | Prevención de errores | n/a | estática |
| 6 | Reconocer | 3 | toast tapa la cifra de plata |
| 7 | Flexibilidad | n/a | landing de un solo camino |
| 8 | Estética | 3 | repite 20 min/24/7/30 días |
| 9 | Recuperación | n/a | sin errores posibles |
| 10 | Ayuda | n/a | conversión |
| Total | | 16/24 | Aceptable |

## Especificidad
Visualmente de la marca, verbalmente genérica. H1 casi literal de Korus; "Reservas online 24/7" y "Métricas en tiempo real" en la lista de frases gastadas (business-map §5.2). El diferenciador ("la seña va a TU MercadoPago", §5.3.2) enterrado en el subtítulo. Detector: 26 hallazgos CLI (17 font-size, 4 radius, 4 color, 1 gray-on-color FP), 47 patrones en vivo desktop / 43 mobile (dark-glow, gradient-text, radial-spotlight, icon-tile-stack, gpt-thin-border-wide-shadow, nested-cards, text-occlusion x2, low-contrast x2). 24 hex + 56 rgba + 16 degradés inline. FP: gray-on-color del CTA, "cyan palette".

## Priority issues
1. [P0] H1 = eslogan de la competencia (page.tsx:147-162). Fix: H1 = mecanismo de la seña (§11.2). clarify
2. [P1] Grilla de 15 min (page.tsx:576-597) es la única visible en mobile; la de 60 min es hidden lg:block. Fix: una fuente de ejemplo en turnos de 60, rotulada. harden
3. [P1] Claims contradichos: 20 min vs 2 min (register/page.tsx:70); "Conectá MercadoPago" como paso 4 pero MP no está en el wizard (api/mp/callback/route.ts:297); "Métricas en tiempo real"; "Integración en un click". clarify
4. [P1] Receta genérica de landing oscura IA + 96 valores sueltos fuera de DESIGN.md. quieter + extract
5. [P2] Toast tapa 100% "$184.500"; low-contrast 3.8:1 y 4.0:1 (#62748e sobre slate oscuro). polish

## Persona red flags
- Dueño primerizo por WhatsApp en el celular: slogan quemado primero, grilla de 15 min, 20 vs 2 min al registrarse.
- Apurado en mobile: 6 features en una columna sin agrupar.
- Comparador multi-pestaña: caza 20 vs 2; busca la política anti-clavo (2 ausencias en 90 días = 14 días sin reservar online) que existe y no se publica.

## Minor
Eyebrow nowrap largo; "partidos fijos"; "En menos de un minuto" sin medir. Corrección del dueño: "Soporte dedicado" es verdad (lo atiende el founder); "Si no ves resultados, lo dejás" es verdad (sin tarjeta).

## Questions
¿Seña como titular y "lleno" fuera? ¿La política anti-clavo como prueba central? ¿Se diffeó alguna grilla contra /grilla real?
