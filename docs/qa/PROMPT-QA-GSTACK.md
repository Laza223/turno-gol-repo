# Prompt para correr el QA de gstack sobre TurnoGol

Preparado el 2026-08-28. Pensado para pegarse en una **sesión nueva**, no en la que lo escribió.

## Antes de pegarlo

1. Estar en `main` y al día.
2. Tener Supabase local levantado (`pnpm supabase:start`, puerto 54322).
3. Tener el server de desarrollo corriendo en otra terminal: `pnpm dev` (http://localhost:3000).
   Next 16 no tolera dos servers de desarrollo sobre la misma carpeta: si ya hay uno, usá ese.

## El prompt

Primero el comando:

```
/qa-only http://localhost:3000 --exhaustive
```

Y en el mismo mensaje, abajo, este contexto:

---

App: **TurnoGol**, un SaaS de reservas y gestión para complejos de canchas de fútbol en
Argentina (Next.js 16, App Router). Quiero un informe de calidad antes de considerarla
lista para clientes reales.

**Cubrí los cuatro tipos de usuario:**

- **Dueño** (rol `admin`) — grilla de turnos, caja, configuración, equipo, métricas.
- **Encargado** (rol `manager`) — grilla, caja, jugadores. **No debe poder entrar a
  Configuración ni a Equipo.** Si entra, es un hallazgo crítico, no cosmético.
- **Jugador** — portal público: buscar complejo, reservar, ver "mis reservas", cancelar.
- **Visitante sin cuenta** — `/explorar`, `/precios`, la ficha pública de un complejo,
  y `/[slug]/torneos`.

**Flujos que más me importan, de punta a punta:**

1. Reservar un turno y cancelarlo.
2. Caja: abrir el día, vender en la cantina, anotar un fiado, cerrar el día y que los
   números cierren.
3. Abonados (turnos fijos semanales).
4. Torneos (está detrás de un interruptor por complejo; si no aparece, no es un bug).

**Dos reglas del dominio que hacen que algo esté mal aunque parezca bien:**

- Los importes son pesos argentinos y se guardan en centavos. Un peso mostrado de más
  o de menos es un hallazgo.
- Las fechas son **día operativo**, no día de calendario: en un complejo que cierra
  después de medianoche, lo que pasa a las 2 de la mañana pertenece a la noche anterior.

**Reglas de trabajo:**

- **Solo reportá. No arregles nada y no hagas ningún commit.** Los arreglos los decido
  yo después de leer el informe.
- Es una base de datos local de prueba: podés crear, editar y borrar sin miedo.
- Ordená los hallazgos por gravedad y para cada uno decime cómo reproducirlo.

---

## Por qué `/qa-only` y no `/qa`

`/qa` arregla los bugs que encuentra y **commitea cada arreglo por su cuenta**. Para
mirar el estado sin que nadie toque el código, `qa-only` es el correcto. Si después
querés que arregle, se corre `/qa` sobre los hallazgos ya conocidos.

## Por qué local y no producción

La skill hace clic en todo y completa todos los formularios. En producción eso significa
reservas de verdad y pagos de MercadoPago de verdad, sobre complejos con clientes reales.
