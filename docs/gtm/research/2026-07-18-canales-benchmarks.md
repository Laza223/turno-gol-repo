# Anexo de research — Canales y benchmarks (informe crudo)

> Producido por agente de investigación (Sonnet) el 2026-07-18, por encargo del red team ([TURNOGOL_MARKETING_RED_TEAM.md](../TURNOGOL_MARKETING_RED_TEAM.md) §5.B). Se conserva íntegro como evidencia. Tipo de cambio de referencia: USD oficial venta $1.500 ARS (ambito.com/dolarhoy.com, 2026-07-18).

---

## 1. Meta Ads Argentina 2026 — costos reales

**Advertencia metodológica**: buena parte del contenido de "benchmarks 2026" online es de baja confiabilidad. Caso concreto detectado: la misma URL (superads.ai) devolvió, en dos consultas separadas, series de CPM incompatibles entre sí para Argentina (incluyendo un "pico" en un mes que todavía no había terminado) — contenido generado dinámicamente, descartado por completo. Fuelads y AdAmigo.ai se presentan como agencia "100% operada por IA" / "proyecciones basadas en benchmarks" — confianza media, no alta.

**CPM**: USD 2,30 (~ARS 3.450) (fuelads.tech/benchmarks-latam-2026, mayo 2026, consultado 2026-07-18) vs USD 3,00-4,80 (adamigo.ai/blog/meta-ads-cpm-cpc-benchmarks-by-country-2026, 2026-07-17). Rangos no coincidentes, se reportan ambos. SODI (agencia argentina, sodi.com.ar, 2026-04-14): Feed FB USD 4-12, Feed IG USD 3-8, **Reels USD 2-5** (Meta lo empuja). Proxy global (NO Argentina): mediana USD 13,48 (WordStream 2025) — Argentina 4-6x más barata, consistente con Tier 3.

**CPC**: USD 0,38 promedio (AdAmigo); IG USD 0,40-1,50, FB USD 0,50-2,00, tráfico USD 0,30-1,00 (SODI).

**Costo por conversación click-to-WhatsApp**: €0,20-0,60 (~ARS 340-1.030) LATAM agregado, vs global DTC €0,80-1,50 (getkanal.com/blog/click-to-whatsapp-ads-benchmarks-2026, 2026-05-26; metodología no auditada). **NO ENCONTRADO**: benchmark específico Argentina de fuente de primer nivel.

**Mínimos de Meta**: técnico USD 1/día (alcance); recomendado **USD 5/día** para clics/conversiones/mensajes; con costo-por-resultado, presupuesto ≥5x el objetivo (Meta Business Help Center es-la.facebook.com/business/help/203183363050448, verificación parcial + get-ryze.ai, consultados 2026-07-18).

**Qué compra USD 100/mes (= ARS 150.000 íntegros a Meta)**:

| Métrica | Rango bajo | Rango alto |
|---|---|---|
| Impresiones/mes (CPM $2,30-12) | 8.333 | 43.478 |
| Clics/mes (CPC $0,38-2,00) | 50 | 333 |
| Conversaciones WA/mes (€0,20-0,60) | 146 | 437 |

INFERENCIA: Meta necesita ~50 resultados/semana por adset para salir de aprendizaje → USD 3,33/día (el total del founder) roza el piso solo en el extremo barato. ARS 50k/mes = USD 1,11/día; ARS 100k/mes = USD 2,22/día — ambos DEBAJO del recomendado.

**NO ENCONTRADO**: benchmark de radio geográfico chico dentro de un partido del GBA — data a nivel país usada como proxy.

## 2. Outbound por WhatsApp en frío — reglas y riesgos 2026

- Política Meta/WhatsApp: opt-in requerido para escribir primero (whatsappbusiness.com/es-la/policy/); ToS prohíben mensajería masiva/automatizada (whatsapp.com/legal/terms-of-service). App gratis: sin templates ni tiers, enforcement opaco por score de calidad (reportes/bloqueos). API paga: plantillas aprobadas + tiers 250→2.000→10.000→100.000→ilimitado (developers.facebook.com/docs/whatsapp/messaging-limits/). Escalera de enforcement: bloqueo 1-3 días → 5-30 días → indefinido → permanente; apelación 24-48hs no garantizada (developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement). Todos consultados 2026-07-18.
- **El patrón de mayor riesgo es exactamente el de Maps-scraping**: mensajes a contactos que nunca guardaron el número emisor (fyno.io, 2024-11-22). NO ENCONTRADO: caso documentado de ban permanente por este patrón exacto (solo anecdótico).
- Volumen app gratis: sin cifra oficial; estimaciones de comunidad 20-30/día a 200-300/día sin consenso; guía LATAM sugiere **20-40 números nuevos/día**, martes-jueves 10-14hs (leadcanvas.app, 2026-06-28).
- Mejores prácticas consenso: personalización real por mensaje, warm-up 7-10 días, rampa lenta, opt-out visible y honrado, lista calificada, WhatsApp como 2do/3er toque en vez de apertura fría.
- **Ley 25.326**: protege personas físicas Y jurídicas (Art. 1-2, InfoLEG texto oficial). **Art. 27**: habilita tratamiento con fines comerciales sin consentimiento previo cuando los datos figuran en documentos accesibles al público, con derecho a retiro (InfoLEG + abogados.com.ar, consultados 2026-07-18). INFERENCIA: ficha de Google Business Profile razonablemente encuadra como "accesible al público" — base legal plausible para contacto B2B con opt-out honrado; no hay dictamen literal del caso.
- **Ley 26.951 (Registro No Llame)**: cubre expresamente WhatsApp cuando el contenido es publicidad/oferta (FAQ oficial AAIP, nollame.aaip.gob.ar/faqs.html, consultado 2026-07-18). Opt-out: **consultar el registro cada 30 días** y no contactar inscriptos. NO ENCONTRADO: tratamiento del fact pattern B2B monotributista exacto; INFERENCIA: el "teléfono del negocio" de un complejo chico suele ser el celular personal del dueño — más cautela.

## 3. Etiquetado de contenido IA en Meta/Instagram 2026

- Labels desde mayo 2024 ("Made with AI" → "AI info" jul-2024) para contenido fotorrealista generado/editado significativamente (about.fb.com 2024-04-05 act. 2025-10-23; techcrunch 2024-07-01; transparency.meta.com act. 2025-02-19). **2025: label extendido a TODOS los ads** creados/editados con IA generativa, automático vía metadata C2PA (about.fb.com/news/2025/02/gen-ai-transparency-metas-ads-products/, act. 2026-06-01). DESMENTIDO: blogs que dicen que el label orgánico "empezó en mayo 2026" — falso.
- Consecuencias de no etiquetar: Meta declaró "penalizaciones" sin especificar (2024, vía cointelegraph). Cifras tipo "14% de rechazo de ads por IA no divulgada": **no aparecen en el Integrity Report Q3-2025 oficial — probablemente fabricadas**.
- **Impacto en alcance: SIN EVIDENCIA DURA de penalización algorítmica por el label.** Lo que SÍ hay: dos estudios peer-reviewed — la divulgación de IA **reduce confianza y engagement del espectador humano** (SAGE 2024, DOI 10.1177/27523543241292096, N=161; Springer Electronic Markets 2026, DOI 10.1007/s12525-026-00883-2, N=325+371). Mosseri (2025-12-31, engadget): Instagram priorizará contenido humano en 2026 — intención declarada, sin mecanismo confirmado.
- Práctica: etiquetar siempre que corresponda; el costo real del label es psicológico (confianza del espectador), no algorítmico.

## 4. SEO local Luján — SERP real (2026-07-18)

- Búsquedas: "cancha de futbol 5 lujan buenos aires", "alquiler cancha futbol lujan" + 4 variantes, con navegación a Google real (Local Pack + AI Overview visibles).
- **Local Pack: 3 negocios por búsqueda, rating 4.6-4.9, 11-92 reseñas — NINGUNO con sitio web propio; el único link de salida es Instagram.** El AI Overview cita 3 complejos (La Canchita Luján, El Vagón Deportivo, Ajax Luján) y linkea Instagram en los 3 — ni Google tiene una web de complejo para citar en Luján.
- Censo Maps ampliado: **~16 fichas de complejos con reseñas activas (13-155 opiniones, 3.3-4.8★); solo 4 con link de sitio y ≥2 de esos apuntan a Instagram.** Único dominio propio real: jorgenewberylujan.com.ar (club infantil, no alquiler).
- **AlquilaTuCancha/ATC: NO apareció en ninguna de las 6 búsquedas ni en las 2 SERP reales** (solo indexa "Luján de Cuyo", Mendoza). Marketplaces genéricos: alquilacancha.com (403, no verificado) y hoysejuega.com (en GBA solo menciona Benavidez, zona norte).
- Conclusión (INFERENCIA): hueco real pero como ÁNGULO DE VENTA (mostrarle al complejo que Google lo cita por el Instagram porque no tiene nada mejor), más que canal pasivo inmediato.

## 5. Benchmarks de contenido B2B nicho — casos reales

- ~30 candidatos investigados (pádel/canchas, barberías, gimnasios, gastronomía, hispanohablantes). **Ningún caso cumple los 3 criterios** (SaaS chico + B2B local + evidencia verificable de clientes por IG/TikTok).
- Fresha (UK, peluquerías): contenido documentado, pero unicornio (ronda USD 80M KKR mayo 2026, 140k negocios — techcrunch 2026-05-21); ni ellos tienen atribución causal clara (milkandcookies.studio, 2026-07-15).
- **Evidencia EN CONTRA en los 2 comparables más cercanos:** el fundador de Alquilá tu Cancha/ATC describió su crecimiento temprano como **llamado en frío puerta a puerta** — la nota no menciona redes (forbesargentina.com, 2023-06-26); su cuenta @sportech_atc ~2.215 seguidores. El CEO de AgendaPro (Serie B USD 35M) atribuyó el crecimiento temprano a **referidos y boca a boca, no redes** (bloomberglinea.com, 2022-08-26). Fudo (AR, ~33K seguidores) y Yeasy (ES): presencia activa, NINGÚN artículo la conecta con adquisición real.
- Conclusión (INFERENCIA): en este nicho el patrón documentado es ventas directas + boca a boca; el contenido aparece como canal cuando la empresa YA escaló. "Crecer con contenido" acá sería apuesta sin precedente, no réplica de canal probado.

## 6. Instagram orgánico 2026 — cuentas nuevas y geografía

- Reels se distribuye mayoritariamente a no-seguidores — camino real de descubrimiento desde 0 (about.instagram.com/blog/announcements/instagram-ranking-explained, 2023-05-31; Transparency Center act. 2026-06-22 mantiene las señales sin filtro por tamaño de cuenta). Cifras virales tipo "3,5% alcance/55% no-seguidores": trazabilidad débil, no verificables en fuente vigente.
- **CONFIRMADO con alta confianza: NO existe segmentación geográfica del alcance orgánico.** Ubicación no figura como señal de ranking en Explore ni Feed (docs jun-2026). La segmentación por radio existe SOLO en Ads Manager (pago) (facebook.com/business/help/202297959811696) — y Meta aclara que hasta el engagement de pauta puede desbordar la zona. Restricción orgánica solo en FB Pages, binaria por país. Mecanismos indirectos débiles: geotag (señal menor), Mapa de IG ago-2025 (pull, no push).

## Implicancias para $150.000 ARS/mes (síntesis del agente)

1. **Meta Ads "bien hecho" cuesta más que todo el presupuesto**: mínimo recomendado USD 5/día ≈ ARS 225.000/mes por UN adset. Con $50-100k/mes se está debajo del piso. **Ráfagas de 8-10 días a USD 5-8/día > goteo de 30 días.**
2. Techo optimista full-budget: un par de cientos de conversaciones WA/mes — con benchmarks de confianza MEDIA. Orden de magnitud, no cifra para proyectar ROI.
3. WhatsApp frío: legal en principio (Art. 27 + 26.951 opt-out) pero **arriesga el número** — sin cifra oficial de volumen seguro (20-40/día la estimación más repetida) y el patrón Maps-scraping es el que más dispara bans. El canal más barato y el único que puede costarte la herramienta.
4. **Ningún caso de referencia valida "crecer con contenido" en este nicho — al contrario** (ATC: puerta a puerta; AgendaPro: referidos). Contenido = canal de marca de bajo costo marginal, NO pilar de adquisición proyectable.
5. **SEO local: el hallazgo más accionable — hueco real como ángulo de venta** (16 complejos en Maps, casi ninguno con web; Google cita sus Instagram hasta en el AI Overview).

Nota transversal: los hallazgos sólidos (3, 4, 5) vienen de fuentes primarias fetchadas directo (texto de ley, Meta Transparency, entrevistas, Google real); los benchmarks cuantitativos de ads son de confianza media — decidir sobre los primeros.
