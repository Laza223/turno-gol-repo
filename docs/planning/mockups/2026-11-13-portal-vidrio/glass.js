/* Mockup: arranca en oscuro. ?theme=light lo fuerza y el botón de arriba lo cambia.
   ?sheet=cancha|localidad abre una hoja del buscador. ?full=1 apaga las apariciones (capturas de página entera). */
(function () {
  var root = document.documentElement, q = new URLSearchParams(location.search), saved = null;
  try { saved = sessionStorage.getItem('tg-theme'); } catch (e) {}
  root.dataset.theme = (q.get('theme') || saved) === 'light' ? 'light' : 'dark';
  root.dataset.sheet = q.get('sheet') || 'none';
  if (q.get('full')) root.dataset.full = '1';

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme'), meta = document.querySelector('meta[name="theme-color"]');
    function paint() {
      var dark = root.dataset.theme === 'dark';
      if (btn) btn.setAttribute('aria-label', dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
      if (meta) meta.setAttribute('content', dark ? '#020617' : '#f3f6f3');
    }
    if (btn) btn.addEventListener('click', function () {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { sessionStorage.setItem('tg-theme', root.dataset.theme); } catch (e) {}
      paint();
    });
    paint();
    document.querySelectorAll('[data-theme-set]').forEach(function (el) {
      function mark() { document.querySelectorAll('[data-theme-set]').forEach(function (o) { o.setAttribute('aria-selected', String(o.dataset.themeSet === root.dataset.theme)); }); }
      el.addEventListener('click', function () { root.dataset.theme = el.dataset.themeSet; try { sessionStorage.setItem('tg-theme', root.dataset.theme); } catch (e) {} paint(); mark(); });
      if (btn) btn.addEventListener('click', mark);
      mark();
    });

    function sheet(name) {
      root.dataset.sheet = name;
      document.querySelectorAll('.sheet, .backdrop').forEach(function (el) {
        el.classList.toggle('is-open', name !== 'none' && (el.classList.contains('backdrop') || el.id === 'sheet-' + name));
      });
    }
    sheet(root.dataset.sheet);
    document.querySelectorAll('[data-open]').forEach(function (el) {
      el.addEventListener('click', function () { sheet(el.dataset.open); });
    });
    document.querySelectorAll('[data-close]').forEach(function (el) {
      el.addEventListener('click', function () { sheet('none'); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') sheet('none'); });

    /* Estados de una pantalla: data-v="grupo:valor" marca un bloque y data-go="grupo:valor" lo muestra.
       Sin grupo, es "main". ?view=valor elige el de "main" al abrir. */
    var state = {};
    function parts(s) { var i = s.indexOf(':'); return i < 0 ? ['main', s] : [s.slice(0, i), s.slice(i + 1)]; }
    function draw() {
      document.querySelectorAll('[data-v]').forEach(function (el) {
        el.hidden = !el.dataset.v.split(' ').some(function (t) { var p = parts(t); return state[p[0]] === p[1]; });
      });
      document.querySelectorAll('[data-go]').forEach(function (el) {
        var p = parts(el.dataset.go);
        if (el.closest('[data-pick]')) return;
        if (el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed', String(state[p[0]] === p[1]));
        if (el.hasAttribute('aria-selected')) el.setAttribute('aria-selected', String(state[p[0]] === p[1]));
      });
      root.dataset.view = state.main || '';
      Object.keys(state).forEach(function (g) { root.setAttribute('data-s-' + g, state[g]); });
    }
    document.querySelectorAll('[data-v]').forEach(function (el) {
      el.dataset.v.split(' ').forEach(function (t) { var p = parts(t); if (!(p[0] in state)) state[p[0]] = p[1]; });
    });
    if (q.get('view')) state.main = q.get('view');
    q.getAll('s').forEach(function (t) { var p = parts(t); state[p[0]] = p[1]; });
    /* data-put="#id|texto" escribe un texto en otro lado al tocar (el horario y el precio elegidos). */
    document.querySelectorAll('[data-put]').forEach(function (el) {
      el.addEventListener('click', function () {
        el.dataset.put.split(';;').forEach(function (t) { var i = t.indexOf('|'), to = document.querySelector(t.slice(0, i)); if (to) to.textContent = t.slice(i + 1); });
      });
    });
    draw();
    document.querySelectorAll('[data-go]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        var p = parts(el.dataset.go);
        if (el.tagName === 'A') e.preventDefault();
        state[p[0]] = p[1];
        sheet('none');
        draw();
        if (p[0] === 'main') { var t = document.querySelector('[data-top]'); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: 'start' }); }
      });
    });
    document.querySelectorAll('[data-stepper]').forEach(function (el) {
      var out = el.querySelector('output');
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        out.textContent = String(Math.min(+el.dataset.max, Math.max(+el.dataset.min, +out.textContent + +b.dataset.d)));
      });
    });
    /* Elegir uno dentro de un grupo (radios y chips del mockup). */
    document.querySelectorAll('[data-pick]').forEach(function (group) {
      group.addEventListener('click', function (e) {
        var b = e.target.closest('[role="radio"], [aria-pressed]');
        if (!b || !group.contains(b)) return;
        var attr = b.hasAttribute('aria-pressed') ? 'aria-pressed' : 'aria-checked';
        group.querySelectorAll('[' + attr + ']').forEach(function (o) { o.setAttribute(attr, String(o === b)); });
      });
    });
    document.querySelectorAll('.fmt:not([aria-disabled="true"])').forEach(function (el) {
      el.addEventListener('click', function () { el.setAttribute('aria-checked', el.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); });
    });
  });
})();
