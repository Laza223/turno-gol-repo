---
paths:
  - "src/modules/rival/**"
  - "src/app/**/rival/**"
  - "docs/rival/**"
---

# RIVAL

RIVAL es el lado jugador de TurnoGol (misma cuenta, misma web), no solo "buscar rival". Visión: `docs/rival/README.md`; catálogo: `docs/rival/ideas.md`; vetos levantados y condiciones: `docs/decisions/2026-10-29-rival-cultura-de-turnogol.md`. Lo construido es v1 (spec `docs/superpowers/specs/2026-10-22-rival-v1-design.md`), detrás del flag global `rival` (`rival.flags.ts`, sin override por complejo).

- **Qué cuenta:** solo el partido oficial **entre dos clubes**: turno en la grilla de un complejo TurnoGol y resultado confirmado por los dos capitanes o por el encargado. Nunca tablas ni categoría sobre datos auto-reportados.
- **Grupo no es club:** el picado de un grupo de amigos suma solo como partido jugado (sin goles, figura, tabla ni categoría). Un jugador está en un club a la vez; cambiar de club, solo en el mercado de pases (`docs/rival/clubes.md`).
- **Categoría** (`docs/rival/categorias.md`): Novena a Primera; privada por defecto; sube en el momento y baja solo al cierre de la temporada.
- **Privado por defecto:** aparecer en una tabla, hacer pública la categoría o la figurita y entrar a Versus es opt-in, con consentimiento por finalidad (Ley 25.326).
- **Lo positivo es público, lo negativo es privado o no existe.** Las tablas individuales muestran solo la parte de arriba; "¿volverían a jugar?" nunca muestra lo negativo.
- **Sin texto libre sobre personas.** El único texto libre que escribe una persona y se publica es el nombre del club, moderado. El texto de la IA (tapa, historia, Diario, informe del DT) no nombra jugadores: habla de clubes y resultados. Votos: la propuesta es guardar el resultado, no quién votó a quién.
- **Sigue vetado:** notas de una persona a otra, escrache y ausencias visibles, karma canjeable, plata entre jugadores, apuestas, precio en la tarjeta, feed de publicaciones, chat, geolocalización, menores de 18.
- **Números reales o nada** en copy y tarjetas. Nunca prometer "te traemos jugadores".
- **Torneos no es parte de RIVAL:** no se prende `tournaments` ni hay copas de RIVAL; un organizador de torneos sería otro producto, más adelante.
- **Levantar un veto no es construir ya:** cada ola entra con su puerta de densidad, su spec y el OK del dueño.
