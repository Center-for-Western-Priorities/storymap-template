// Storymap runtime. The build script fills in the data; this code draws the
// map, the scrolling story, and the filters.
const D = JSON.parse(document.getElementById("storymap-data").textContent);
const NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("map");
const SITES = D.sites;
const FULL = D.view.slice();
const MIN_W = FULL[2] / 14;
let vb = FULL.slice();
const state = { sel: null, f: D.filters.map(f => f.style === "dropdown" ? "" : new Set()) };
svg.setAttribute("viewBox", vb.join(" "));

function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* Base map */
const gShapes = el("g", {}, svg);
D.shapes.forEach((f, i) => {
  const p = el("path", { d: f.d, class: "shape" + (f.has ? " has-sites" : "") }, gShapes);
  p.dataset.i = i;
  if (f.has) { const t = el("title", {}, p); t.textContent = f.name + ": click to zoom in"; p.addEventListener("click", () => { if (!justDragged) { userView(); zoomShape(i); } }); }
});
D.mapLabels.forEach(l => { const t = el("text", { x: l.x, y: l.y, class: "map-label" }, svg); t.textContent = l.text; });

/* Points */
const gMk = el("g", {}, svg);
SITES.forEach(s => {
  const g = el("g", { class: "mk", tabindex: "0", role: "button", "aria-label": `${s.n}. ${s.name}` }, gMk);
  el("circle", { cx: s.x, cy: s.y, class: "ring" }, g);
  el("circle", { cx: s.x, cy: s.y, class: "dot", style: `fill:${s.c}` }, g);
  if (D.numbered) { const t = el("text", { x: s.x, y: s.y, style: `fill:${s.ink}` }, g); t.textContent = s.n; }
  const tt = el("title", {}, g); tt.textContent = s.name;
  g.addEventListener("click", e => { e.stopPropagation(); if (!justDragged) goTo(s.id); });
  g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goTo(s.id); } });
  s.g = g;
});
function sizeMarkers() {
  const k = 1 / (pxScale() || 1), base = D.numbered ? 11 : 7;
  SITES.forEach(s => {
    const sel = s.id === state.sel, r = (sel ? base + 2 : base) * k;
    const [ring, dot, txt] = s.g.children;
    dot.setAttribute("r", r); dot.setAttribute("stroke-width", 2 * k);
    ring.setAttribute("r", r + 4 * k); ring.setAttribute("stroke-width", 3 * k);
    if (txt && txt.tagName === "text") txt.setAttribute("font-size", (s.n > 9 ? 11 : 12) * k * (sel ? 1.1 : 1));
  });
  document.querySelectorAll(".map-label").forEach(t => t.setAttribute("font-size", 10 * k));
}

/* Pan and zoom */
function clampVb(v) {
  let [x, y, w, h] = v;
  w = Math.min(Math.max(w, MIN_W), FULL[2]); h = w * FULL[3] / FULL[2];
  const [fx, fy, fw, fh] = FULL;
  x = Math.min(Math.max(x, fx - w * 0.25), fx + fw - w * 0.75);
  y = Math.min(Math.max(y, fy - h * 0.25), fy + fh - h * 0.75);
  return [x, y, w, h];
}
function applyVb(v) { vb = clampVb(v); svg.setAttribute("viewBox", vb.join(" ")); sizeMarkers(); }
let anim = null;
function animateTo(target, dur) {
  if (anim) cancelAnimationFrame(anim);
  if (dur == null) dur = 650;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) dur = 0;
  const from = vb.slice(), to = clampVb(target), t0 = performance.now();
  const step = now => {
    const t = dur ? Math.min(1, (now - t0) / dur) : 1, e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    applyVb(from.map((v, i) => v + (to[i] - v) * e));
    if (t < 1) anim = requestAnimationFrame(step); else anim = null;
  };
  anim = requestAnimationFrame(step);
}
function zoomAround(factor, cx, cy, animate) {
  const w = Math.min(Math.max(vb[2] * factor, MIN_W), FULL[2]), f = w / vb[2], h = vb[3] * f;
  const v = [cx - (cx - vb[0]) * f, cy - (cy - vb[1]) * f, w, h];
  animate ? animateTo(v, 250) : applyVb(v);
}
function center() { return [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2]; }
function toSvg(clientX, clientY) {
  const r = svg.getBoundingClientRect(), s = Math.min(r.width / vb[2], r.height / vb[3]);
  const ox = (r.width - vb[2] * s) / 2, oy = (r.height - vb[3] * s) / 2;
  return [vb[0] + (clientX - r.left - ox) / s, vb[1] + (clientY - r.top - oy) / s];
}
function pxScale() { const r = svg.getBoundingClientRect(); return Math.min(r.width / vb[2], r.height / vb[3]); }
function fit(x0, y0, w, h) {
  const ar = FULL[2] / FULL[3];
  if (w / h > ar) { const nh = w / ar; y0 -= (nh - h) / 2; h = nh; } else { const nw = h * ar; x0 -= (nw - w) / 2; w = nw; }
  return [x0, y0, w, h];
}
function shapeView(i) {
  let [[x0, y0], [x1, y1]] = D.shapes[i].b;
  const pad = Math.max(x1 - x0, y1 - y0) * 0.2, w = Math.max(x1 - x0 + 2 * pad, MIN_W * 2);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, h = Math.max(y1 - y0 + 2 * pad, MIN_W * 2);
  return fit(cx - w / 2, cy - h / 2, Math.min(w, FULL[2]), Math.min(h, FULL[3]));
}
function siteView(s) { const w = FULL[2] * D.pointZoom; return fit(s.x - w / 2, s.y - w / 2, w, w); }
function markActive(i) { gShapes.querySelectorAll(".shape").forEach(p => p.classList.toggle("active", i !== null && +p.dataset.i === i)); }
function zoomShape(i) { markActive(i); animateTo(shapeView(i)); }
function zoomFull() { markActive(null); animateTo(FULL); }

let userMoved = false;
function userView() { userMoved = true; }
document.getElementById("zin").addEventListener("click", () => { userView(); const [cx, cy] = center(); zoomAround(0.6, cx, cy, true); });
document.getElementById("zout").addEventListener("click", () => { userView(); markActive(null); const [cx, cy] = center(); zoomAround(1 / 0.6, cx, cy, true); });
document.getElementById("zfull").addEventListener("click", () => { userView(); zoomFull(); });

const ptrs = new Map(); let drag = null, pinch = null, justDragged = false;
svg.addEventListener("pointerdown", e => {
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY, vb: vb.slice(), moved: false }; }
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), vb: vb.slice() }; drag = null; }
});
svg.addEventListener("pointermove", e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    vb = pinch.vb.slice(); const [cx, cy] = toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    userView(); zoomAround(pinch.d / d, cx, cy, false); justDragged = true; return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 5) return;
  if (!drag.moved) { drag.moved = true; svg.setPointerCapture(e.pointerId); svg.classList.add("dragging"); cancelAnimationFrame(anim); userView(); drag.s = pxScale(); }
  applyVb([drag.vb[0] - dx / drag.s, drag.vb[1] - dy / drag.s, drag.vb[2], drag.vb[3]]);
});
function endPtr(e) {
  ptrs.delete(e.pointerId);
  if ((drag && drag.moved) || pinch) setTimeout(() => { justDragged = false; }, 0);
  if (drag && drag.moved) justDragged = true;
  if (ptrs.size < 2) pinch = null;
  if (!ptrs.size) { drag = null; svg.classList.remove("dragging"); }
}
svg.addEventListener("pointerup", endPtr); svg.addEventListener("pointercancel", endPtr);
svg.addEventListener("wheel", e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); userView(); const [cx, cy] = toSvg(e.clientX, e.clientY); zoomAround(Math.exp(e.deltaY * 0.01), cx, cy, false); }, { passive: false });
svg.addEventListener("dblclick", e => { if (e.target.closest(".mk")) return; userView(); const [cx, cy] = toSvg(e.clientX, e.clientY); zoomAround(0.5, cx, cy, true); });

/* Legend */
const legend = document.getElementById("legend");
if (D.legend && D.legend.items.length) {
  legend.innerHTML = (D.legend.title ? `<span class="lt">${esc(D.legend.title)}</span>` : "") +
    D.legend.items.map(i => `<span class="lg" style="--c:${i.c}"><span class="dot"></span>${esc(i.v)}</span>`).join("");
} else legend.remove();

/* Filters */
document.querySelectorAll("select[data-f]").forEach(sel => sel.addEventListener("change", () => { state.f[+sel.dataset.f] = sel.value; renderSteps(); }));
document.querySelectorAll(".fgroup[data-f]").forEach(g => g.querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => {
  const set = state.f[+g.dataset.f], v = b.textContent;
  set.has(v) ? set.delete(v) : set.add(v); b.setAttribute("aria-pressed", set.has(v)); renderSteps();
})));
function clearFilters() {
  state.f = D.filters.map(f => f.style === "dropdown" ? "" : new Set());
  document.querySelectorAll("select[data-f]").forEach(s => s.value = "");
  document.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", "false"));
}
const resetBtn = document.getElementById("resetBtn");
if (resetBtn) resetBtn.addEventListener("click", () => { clearFilters(); renderSteps(); zoomFull(); });

function byId(id) { return SITES.find(s => s.id === id); }
function visible(s) {
  return D.filters.every((f, i) => {
    const want = state.f[i], have = s.f[f.column] || [];
    return f.style === "dropdown" ? (!want || have.includes(want)) : (!want.size || have.some(v => want.has(v)));
  });
}

/* Story */
function figure(s) {
  if (!s.photo) return "";
  return `<figure><img src="${esc(s.photo)}" alt="${esc(s.alt)}" loading="lazy">${s.caption ? `<figcaption>${s.caption}</figcaption>` : ""}</figure>`;
}
function tags(s) {
  if (!s.tags.length) return "";
  return `<div class="meta">${s.tags.map(t => t.c ? `<span class="tag" style="--c:${t.c}"><span class="dot"></span>${esc(t.v)}</span>` : `<span class="tag plain">${esc(t.v)}</span>`).join("")}</div>`;
}
function badge(s) { return D.numbered ? `<span class="num" style="--c:${s.c};--ink:${s.ink}">${s.n}</span>` : `<span class="num nodot" style="--c:${s.c}"></span>`; }
const stepsBox = document.getElementById("steps");
const L = D.labels;
let observer = null;
function renderSteps() {
  const vis = SITES.filter(visible);
  stepsBox.innerHTML = (vis.length ? vis.map(s => `<article class="step" id="${s.id}" data-id="${s.id}" style="--c:${s.c}">
      <h2>${badge(s)}<span>${esc(s.name)}</span></h2>${tags(s)}${figure(s)}
      <div class="body">${s.html}</div></article>`).join("")
    : `<p class="empty">No ${esc(L.plural)} match these filters.</p>`)
    + `<div class="step endcap" data-id="__end"><h2>${esc(L.endTitle)}</h2><p>${esc(L.endText)}</p><button class="btn primary" type="button" id="topBtn">${esc(L.endButton)}</button></div>`;
  stepsBox.querySelector("#topBtn").addEventListener("click", () => { const f = stepsBox.querySelector(".step[data-id]"); if (f && f.dataset.id !== "__end") goTo(f.dataset.id); });
  SITES.forEach(s => s.g.classList.toggle("off", !visible(s)));
  const count = document.getElementById("count");
  if (count) count.textContent = `Showing ${vis.length} of ${SITES.length} ${SITES.length === 1 ? L.singular : L.plural}`;
  if (state.sel && !visible(byId(state.sel))) setSel(null);
  observe();
}
function setSel(id) {
  state.sel = id;
  SITES.forEach(s => s.g.classList.toggle("sel", s.id === id));
  if (id) gMk.appendChild(byId(id).g);
  stepsBox.querySelectorAll(".step").forEach(st => st.classList.toggle("active", st.dataset.id === id || (st.dataset.id === "__end" && !id)));
  const ns = document.getElementById("nowshowing");
  if (id) { const s = byId(id); ns.hidden = false; ns.firstChild.textContent = D.numbered ? `${s.n}. ${s.name}` : s.name; ns.firstChild.style.setProperty("--c", s.c); } else ns.hidden = true;
  sizeMarkers();
}
/* The step crossing the middle of the screen becomes active and the map flies to it. */
function observe() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const id = en.target.dataset.id;
      if (id === "__end") { if (state.sel !== null) { setSel(null); if (!userMoved) zoomFull(); } return; }
      if (id === state.sel) return;
      userMoved = false;
      setSel(id); markActive(null); animateTo(siteView(byId(id)));
    });
  }, { rootMargin: matchMedia("(max-width: 900px)").matches ? "-62% 0px -30% 0px" : "-45% 0px -45% 0px" });
  stepsBox.querySelectorAll(".step").forEach(st => observer.observe(st));
}
/* Clicking a point scrolls the story to that place. */
function goTo(id) {
  const s = byId(id); if (!s) return;
  if (!visible(s)) { clearFilters(); renderSteps(); }
  const step = document.getElementById(id);
  setSel(id); userMoved = false; animateTo(siteView(s));
  const mobile = matchMedia("(max-width: 900px)").matches;
  const top = step.getBoundingClientRect().top + scrollY - (mobile ? document.querySelector(".mapcol").offsetHeight + 8 : 24);
  scrollTo({ top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

addEventListener("resize", sizeMarkers);
sizeMarkers(); renderSteps();
const h = decodeURIComponent(location.hash.slice(1));
if (byId(h)) setTimeout(() => goTo(h), 300);
