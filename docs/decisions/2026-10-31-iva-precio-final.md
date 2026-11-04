# Decisión: los $30.000 por cancha son precio final, sin IVA aparte

**Fecha:** 2026-10-31 · **Decide:** Lazar (founder) · **Cierra:** D9 de [`2026-09-02-experimento-30-dias.md`](2026-09-02-experimento-30-dias.md) y el WARNING de IVA de [`doc4`](../spec/doc4_monetizacion.md) §1 (REQUIERE INPUT abierto desde 2026-08-07).

## Problema

`doc4` decía "precios sin IVA, +21% en el checkout", pero el código nunca lo implementó: el checkout cobra el número pelado de `src/modules/billing/pricing.ts`. Por esa duda, los guiones de venta prohibían decir "+IVA" y "precio final".

## Decisión

1. **El precio de lista es final.** $30.000 por cancha (y el extra de TurnoGol Plus) no llevan IVA aparte. Lo que se dice en la venta es lo que se cobra.
2. **No se implementa cálculo de IVA** ni `price_without_tax`: no hay nada que construir. El monto sigue saliendo solo de `pricing.ts`.
3. **Los guiones pueden decir "es precio final".** Se levanta la prohibición de `06-scripts`, `07-objeciones` y `10-playbook-ia`; `04-oferta-piloto` ya no promete "+IVA".

## Consecuencias

- Se revierte la lectura de agosto de que la comparación con ATC dependía de sumar 21%: con precio final no hay recargo oculto que explicar.
- El tratamiento fiscal de TurnoGol como emisor (qué factura emite y a quién) no cambia por esta decisión; sigue fuera de scope v1 (ADR-011).
- Cambiar esto después (pasar a "+IVA") es cambio de precio: necesita decisión escrita del dueño.

## REQUIERE INPUT

1. ¿`/precios` y el checkout deben decir "precio final" explícitamente? Hoy ningún texto de la aplicación lo dice (ni `/terminos`). No se tocó código ni páginas en esta decisión.
