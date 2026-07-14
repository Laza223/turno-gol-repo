// TS 6 introdujo TS2882: un import side-effect (`import './globals.css'`, sin
// binding) ahora exige que el módulo tenga declaración de tipos. Antes tsc los
// dejaba pasar en silencio.
//
// Next declara `*.module.css` (CSS Modules, que sí tienen un shape tipado), pero
// no los `.css` planos que se importan sólo por su efecto: src/app/globals.css y
// leaflet/dist/leaflet.css. El bundling real lo hace webpack/SWC; esta
// declaración existe únicamente para que `tsc --noEmit` los acepte.
//
// El wildcard es más general que el `*.module.css` de Next, y TS resuelve por
// especificidad, así que los CSS Modules siguen tipando igual que antes.
declare module '*.css'
