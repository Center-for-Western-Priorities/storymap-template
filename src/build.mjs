// Builds the storymap from content/story.md, content/sites.csv, and config.yml
// into _site/index.html. Run with `npm run build`. Problems that would break
// the page stop the build with a plain-language error; smaller issues are
// listed as warnings and the build continues.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as yaml from "js-yaml";
import { parse as parseCsv } from "csv-parse/sync";
import { marked } from "marked";
import { geoAlbersUsa, geoConicEqualArea, geoPath, geoContains, geoBounds, geoCentroid } from "d3-geo";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const SRC = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(process.argv[2] || process.cwd());
const OUT = path.join(ROOT, "_site");
const W = 975, H = 610;

const errors = [], warnings = [];
const err = (file, msg) => errors.push({ file, msg });
const warn = (file, msg) => warnings.push({ file, msg });

const STORY = "content/story.md", SITES = "content/sites.csv", CONFIG = "config.yml";

// ---------- helpers ----------
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = rel => rel && fs.existsSync(path.join(ROOT, rel));
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const newTab = html => html.replace(/<a href="(https?:)/g, '<a target="_blank" rel="noopener" href="$1');
const inline = md => newTab(marked.parseInline(String(md ?? "")));
const plain = s => String(s ?? "").replace(/<[^>]+>/g, "").replace(/\\(.)/g, "$1").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
function norm(s) {
  return plain(s).replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/^\d+\s*[.)]\s*/, "").replace(/[:\s]+$/, "").toLowerCase();
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function closest(value, options) {
  let best = null, bd = Infinity;
  for (const o of options) { const x = lev(value.toLowerCase(), o.toLowerCase()); if (x < bd) { bd = x; best = o; } }
  return bd <= Math.max(2, Math.floor(value.length / 4)) ? best : null;
}
function ink(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#ffffff";
  const n = parseInt(m[1], 16), ch = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  const L = .2126 * ch[0] + .7152 * ch[1] + .0722 * ch[2];
  return L > .4 ? "#2a2a28" : "#ffffff";
}
const isHex = c => /^#[0-9a-f]{6}$/i.test(String(c || ""));
const list = v => String(v ?? "").split(";").map(x => x.trim()).filter(Boolean);

// ---------- config ----------
let cfg = {};
try { cfg = yaml.load(read(CONFIG)) || {}; }
catch (e) { err(CONFIG, `This file couldn't be read. Check the spacing near line ${(e.mark?.line ?? 0) + 1}. ${e.reason || e.message}`); }
const mapCfg = cfg.map || {}, ptsCfg = cfg.points || {}, labels = Object.assign({
  singular: "place", plural: "places", how_to: "**Scroll** to move through every place in order.",
  end_title: "Explore on your own", end_text: "Drag the map, zoom in, or click any point to revisit a place.", end_button: "Back to the first place"
}, cfg.labels || {});
const filtersCfg = Array.isArray(cfg.filters) ? cfg.filters : [];
const colorBy = ptsCfg.color_by || "";
const colors = ptsCfg.colors || {};
const defaultColor = isHex(ptsCfg.default_color) ? ptsCfg.default_color : "#d2781e";
for (const [k, c] of Object.entries(colors)) if (!isHex(c)) err(CONFIG, `The color for "${k}" is "${c}". Colors need to be six-digit codes like "#c96d17".`);
if (ptsCfg.default_color && !isHex(ptsCfg.default_color)) err(CONFIG, `default_color "${ptsCfg.default_color}" needs to be a six-digit code like "#d2781e".`);

// ---------- sites.csv ----------
let rows = [];
if (!exists(SITES)) err(SITES, "This file is missing.");
else {
  try { rows = parseCsv(read(SITES), { columns: h => h.map(x => x.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true, relax_column_count: true }); }
  catch (e) { err(SITES, `This file couldn't be read as a spreadsheet: ${e.message}`); }
}
const columns = rows.length ? Object.keys(rows[0]) : [];
for (const c of ["id", "name", "lat", "lon"]) if (rows.length && !columns.includes(c)) err(SITES, `The required column "${c}" is missing.`);
const sites = [], seenId = new Set(), seenName = new Map();
rows.forEach((r, i) => {
  const line = `Row ${i + 2}`;
  if (!Object.values(r).some(v => v)) return;
  const id = r.id || "", name = r.name || "";
  if (!name) { err(SITES, `${line} has no name.`); return; }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    const fix = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    err(SITES, `${line} (${name}): the id "${id}" can only use lowercase letters, numbers, and hyphens. Try "${fix}".`); return;
  }
  if (seenId.has(id)) err(SITES, `${line}: the id "${id}" is used more than once.`);
  if (seenName.has(norm(name))) err(SITES, `${line}: the name "${name}" is used more than once.`);
  seenId.add(id); seenName.set(norm(name), id);
  const lat = Number(r.lat), lon = Number(r.lon);
  if (!r.lat || !r.lon || Number.isNaN(lat) || Number.isNaN(lon)) err(SITES, `${line} (${name}): lat and lon need to be numbers, like 36.03 and -107.91.`);
  else if (Math.abs(lat) > 90 || Math.abs(lon) > 180) err(SITES, `${line} (${name}): ${lat}, ${lon} isn't a real coordinate. lat should be between -90 and 90, lon between -180 and 180.`);
  let photo = (r.photo || "").replace(/^images\//, "");
  if (photo) {
    const dir = path.join(ROOT, "images"), files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    if (!files.includes(photo)) {
      const ci = files.find(f => f.toLowerCase() === photo.toLowerCase());
      err(SITES, ci ? `${line} (${name}): the photo is listed as "${photo}" but the file is named "${ci}". Capital letters have to match.`
                    : `${line} (${name}): the photo "${photo}" isn't in the images folder.`);
    }
    if (!r.photo_credit) warn(SITES, `${line} (${name}) has a photo but no photo_credit.`);
    if (r.photo_license && !r.photo_license_url) warn(SITES, `${line} (${name}) lists a license but no photo_license_url.`);
  }
  sites.push({ id, name, lat, lon, row: i + 2, raw: r, photo });
});
if (rows.length && !sites.length) err(SITES, "No places found.");

// Filter, color, and tag columns must exist; flag likely typos in their values.
const usedCols = new Set([...filtersCfg.map(f => f.column), ...(cfg.tags || []), colorBy].filter(Boolean));
for (const col of usedCols) {
  if (rows.length && !columns.includes(String(col).toLowerCase())) { err(CONFIG, `config.yml uses the column "${col}", but sites.csv has no column with that name. Columns found: ${columns.join(", ")}.`); continue; }
  const counts = new Map();
  sites.forEach(s => list(s.raw[col]).forEach(v => counts.set(v, (counts.get(v) || 0) + 1)));
  if (col === colorBy) {
    for (const v of counts.keys()) if (!(v in colors)) {
      const near = closest(v, Object.keys(colors));
      err(SITES, `The ${col} value "${v}" has no color in config.yml.${near ? ` Did you mean "${near}"?` : ` Colors are set for: ${Object.keys(colors).join(", ")}.`}`);
    }
  } else {
    const vals = [...counts.keys()];
    for (const v of vals) if (counts.get(v) === 1) {
      const near = closest(v, vals.filter(x => x !== v && counts.get(x) > 1));
      if (near) warn(SITES, `The ${col} value "${v}" appears once and looks like "${near}". Check for a typo.`);
    }
  }
}
for (const f of filtersCfg) if (!["dropdown", "buttons"].includes(f.style || "dropdown")) err(CONFIG, `Filter "${f.label || f.column}" has style "${f.style}". Use "dropdown" or "buttons".`);

// ---------- story.md ----------
const RESERVED = {
  notice: ["notice", "update", "update notice"],
  intro: ["introduction", "intro", "intro text"],
  notes: ["notes", "methodology", "sources", "about this map"],
};
let title = "", dekTokens = [];
const sections = { notice: null, intro: null, notes: null };
const siteText = new Map(), order = [];
if (!exists(STORY)) err(STORY, "This file is missing.");
else {
  let md = read(STORY).replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "");
  // Google Docs exports pictures as embedded data at the end of the file. Pictures go in sites.csv instead.
  const imgRefs = (md.match(/^\[image\d+\]:.*$/gm) || []).length;
  md = md.replace(/^\[image\d+\]:.*$/gm, "").replace(/!\[[^\]]*\]\[[^\]]*\]|!\[[^\]]*\]\([^)]*\)/g, "");
  if (imgRefs) warn(STORY, `Removed ${imgRefs} picture(s) pasted into the doc. Add photos through the images folder and sites.csv instead.`);

  const tokens = marked.lexer(md);
  const byName = new Map(sites.map(s => [norm(s.name), s]));
  const matchSite = h => {
    const n = norm(h); if (byName.has(n)) return byName.get(n);
    for (const s of sites) { const sn = norm(s.name); if (n === s.id || n.startsWith(sn + ",") || n.startsWith(sn + " (")) return s; }
    return null;
  };
  const matchReserved = h => Object.keys(RESERVED).find(k => RESERVED[k].includes(norm(h)));
  let cur = null; // { kind: "dek" | "reserved" | "site", key, tokens }
  const start = (kind, key, label) => {
    if (kind === "site" && siteText.has(key)) err(STORY, `"${label}" appears twice. Each place needs exactly one section.`);
    if (kind === "reserved" && sections[key]) err(STORY, `There are two "${label}" sections. Combine them into one.`);
    cur = { kind, key, tokens: [] };
    if (kind === "site") { siteText.set(key, cur.tokens); order.push(key); } else sections[key] = cur.tokens;
  };
  for (const t of tokens) {
    if (t.type === "space") continue;
    const boldLine = t.type === "paragraph" && t.tokens?.length === 1 && t.tokens[0].type === "strong" && t.text.length < 160;
    if (t.type === "heading" && t.depth === 1 && !title) { title = plain(t.text); cur = { kind: "dek", tokens: dekTokens }; continue; }
    if ((t.type === "heading" && t.depth <= 2) || boldLine) {
      const label = plain(t.text), s = matchSite(label), r = matchReserved(label);
      if (s) { start("site", s.id, label); continue; }
      if (r) { start("reserved", r, label); continue; }
      if (t.type === "heading") {
        const near = closest(norm(label), sites.map(x => norm(x.name)));
        err(STORY, `The heading "${label}" doesn't match a place in sites.csv${near ? ` (closest: "${sites.find(x => norm(x.name) === near).name}")` : ""}, and it isn't Notice, Introduction, or Notes. Fix the heading or add the place to sites.csv.`);
        cur = { kind: "skip", tokens: [] }; continue;
      }
      if (/^\d+\s*[.)]/.test(label)) {
        const near = closest(norm(label), sites.map(x => norm(x.name)));
        err(STORY, `"${label}" looks like a place heading but doesn't match a name in sites.csv${near ? ` (closest: "${sites.find(x => norm(x.name) === near).name}")` : ""}. Its text would end up under the place before it. Make the heading match the name column in sites.csv.`);
        cur = { kind: "skip", tokens: [] }; continue;
      }
    }
    if (!cur) { if (t.type !== "hr") warn(STORY, `Text before the title was ignored: "${plain(t.raw).slice(0, 60)}…"`); continue; }
    cur.tokens.push(t);
  }
  if (!title) err(STORY, `The doc needs a title on the first line, styled as "Title" or "Heading 1" in Google Docs (a line starting with "# " in Markdown).`);
  for (const s of sites) if (!siteText.has(s.id)) warn(STORY, `"${s.name}" is in sites.csv but has no section in story.md, so it isn't on the map yet.`);
  for (const [id, toks] of siteText) if (!toks.some(t => t.type !== "space")) warn(STORY, `The section for "${sites.find(s => s.id === id).name}" has no text.`);
}
const render = toks => toks ? newTab(marked.parser(Object.assign(toks.slice(), { links: {} }))) : "";

// ---------- map ----------
const us = require("us-atlas/states-10m.json");
let features = feature(us, us.objects.states).features;
let proj, inset = false, mapNote = mapCfg.note ?? "";
const extent = (mapCfg.extent || "us").toLowerCase();
const fitConic = target => {
  let [[w, s], [e, n]] = geoBounds(target);
  if (e < w) e += 360; // crosses the date line (Alaska's Aleutians)
  const c = geoCentroid(target);
  const p = geoConicEqualArea().parallels([s + (n - s) / 6, n - (n - s) / 6]).rotate([-c[0], 0]);
  return p.fitExtent([[24, 24], [W - 24, H - 24]], target).clipExtent([[-W, -H], [2 * W, 2 * H]]);
};
const boxShape = b => ({ type: "MultiPoint", coordinates: Array.from({ length: 21 }, (_, i) => i / 20).flatMap(t => [[b[0] + (b[2] - b[0]) * t, b[1]], [b[0] + (b[2] - b[0]) * t, b[3]], [b[0], b[1] + (b[3] - b[1]) * t], [b[2], b[1] + (b[3] - b[1]) * t]]) });
const goodBox = b => Array.isArray(b) && b.length === 4 && b.every(x => typeof x === "number") && b[0] < b[2] && b[1] < b[3];
if (extent === "us") {
  proj = geoAlbersUsa().scale(1300).translate([W / 2, H / 2]); inset = true;
} else if (extent === "states") {
  const want = (mapCfg.states || []).map(String);
  const picked = features.filter(f => want.some(w => w.toLowerCase() === f.properties.name.toLowerCase()));
  for (const w of want) if (!features.some(f => f.properties.name.toLowerCase() === w.toLowerCase())) {
    const near = closest(w, features.map(f => f.properties.name));
    err(CONFIG, `map.states lists "${w}", which isn't a state name.${near ? ` Did you mean "${near}"?` : ""}`);
  }
  if (!want.length) err(CONFIG, `map.extent is "states", but map.states is empty. List at least one, like [Colorado].`);
  if (picked.length) proj = fitConic({ type: "FeatureCollection", features: picked });
} else if (extent === "box") {
  if (!goodBox(mapCfg.box)) err(CONFIG, `map.extent is "box", so map.box needs four numbers: [west, south, east, north], like [-112.5, 34.5, -105.5, 39.5].`);
  else proj = fitConic(boxShape(mapCfg.box));
} else if (extent === "custom") {
  if (!exists(mapCfg.basemap)) err(CONFIG, `map.extent is "custom", but the basemap file "${mapCfg.basemap || ""}" wasn't found.`);
  else {
    try {
      const gj = JSON.parse(read(mapCfg.basemap));
      features = (gj.type === "FeatureCollection" ? gj.features : [gj]).map(f => ({ ...f, properties: { ...f.properties, name: f.properties?.name || f.properties?.NAME || "" } }));
      proj = fitConic(goodBox(mapCfg.box) ? boxShape(mapCfg.box) : { type: "FeatureCollection", features });
    } catch (e) { err(CONFIG, `The basemap file couldn't be read as GeoJSON: ${e.message}`); }
  }
} else err(CONFIG, `map.extent is "${mapCfg.extent}". Use us, states, box, or custom.`);

const shapes = [], points = [];
let fullView = [0, 0, W, H], labelsOnMap = [];
if (proj) {
  const gp = geoPath(proj).digits(1);
  for (const f of features) {
    const d = gp(f); if (!d) continue;
    const b = gp.bounds(f);
    shapes.push({ name: f.properties.name, d, b: b.map(p => p.map(v => +v.toFixed(1))), has: false, f });
  }
  if (inset) {
    const all = shapes.map(s => s.b), x0 = Math.min(...all.map(b => b[0][0])), y0 = Math.min(...all.map(b => b[0][1]));
    const x1 = Math.max(...all.map(b => b[1][0])), y1 = Math.max(...all.map(b => b[1][1]));
    fullView = [x0 - 12, y0 - 12, x1 - x0 + 24, y1 - y0 + 24].map(v => +v.toFixed(1));
    for (const n of ["Alaska", "Hawaii"]) {
      const s = shapes.find(x => x.name === n); if (!s) continue;
      const c = geoPath(proj).centroid(s.f); labelsOnMap.push({ text: n, x: +c[0].toFixed(1), y: +(s.b[0][1] - 6).toFixed(1) });
    }
    if (mapCfg.note === undefined) mapNote = "Points mark approximate locations. Alaska and Hawaii are not shown to scale.";
  }
  for (const s of sites) {
    if (!siteText.has(s.id) || Number.isNaN(s.lat) || Number.isNaN(s.lon)) continue;
    const p = proj([s.lon, s.lat]);
    const off = !p || p[0] < fullView[0] || p[1] < fullView[1] || p[0] > fullView[0] + fullView[2] || p[1] > fullView[1] + fullView[3];
    if (off) {
      const hint = s.lon > 0 && s.lat > 0 && extent !== "custom" ? " Longitudes in the Western U.S. are negative numbers, so check for a missing minus sign." : " Check the coordinates or widen the map extent in config.yml.";
      err(SITES, `Row ${s.row} (${s.name}): ${s.lat}, ${s.lon} falls outside the map.${hint}`); continue;
    }
    s.x = +p[0].toFixed(1); s.y = +p[1].toFixed(1);
    for (const sh of shapes) if (!sh.has && geoContains(sh.f, [s.lon, s.lat])) sh.has = true;
  }
}

// ---------- report ----------
const gha = !!process.env.GITHUB_ACTIONS;
for (const w of warnings) console.log(gha ? `::warning file=${w.file}::${w.msg}` : `Warning (${w.file}): ${w.msg}`);
for (const e of errors) console.log(gha ? `::error file=${e.file}::${e.msg}` : `Error (${e.file}): ${e.msg}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [errors.length ? "## The map was not updated" : "## Map built", ""];
  if (errors.length) lines.push("Fix these problems, then upload the corrected file. The live map hasn't changed.", "", ...errors.map(e => `- **${e.file}:** ${e.msg}`), "");
  if (warnings.length) lines.push("### Things to check", "", ...warnings.map(w => `- **${w.file}:** ${w.msg}`), "");
  if (!errors.length) lines.push(`${order.length} ${order.length === 1 ? labels.singular : labels.plural} on the map.`);
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}
if (errors.length) { console.log(`\nBuild stopped: ${errors.length} problem(s) to fix.`); process.exit(1); }

// ---------- assemble ----------
const byId = Object.fromEntries(sites.map(s => [s.id, s]));
const out = order.map(id => byId[id]).filter(s => s && s.x !== undefined);
const colorFor = s => colorBy ? (colors[list(s.raw[colorBy])[0]] || defaultColor) : defaultColor;
const tagCols = (cfg.tags || []).map(c => String(c).toLowerCase());
const data = {
  view: fullView, pointZoom: Number(mapCfg.point_zoom) || 0.24, numbered: mapCfg.numbered !== false,
  shapes: shapes.map(({ name, d, b, has }) => ({ name, d, b, has })), mapLabels: labelsOnMap,
  sites: out.map((s, i) => {
    const r = s.raw, c = colorFor(s);
    const credit = r.photo_credit ? (r.photo_credit_url ? `<a href="${esc(r.photo_credit_url)}" target="_blank" rel="noopener">${esc(r.photo_credit)}</a>` : esc(r.photo_credit)) : "";
    const lic = r.photo_license ? (r.photo_license_url ? `, <a href="${esc(r.photo_license_url)}" target="_blank" rel="noopener">${esc(r.photo_license)}</a>` : `, ${esc(r.photo_license)}`) : "";
    const cap = [r.photo_caption ? esc(r.photo_caption.replace(/\.$/, "")) + "." : "", credit ? `Photo: ${credit}${lic}` : ""].filter(Boolean).join(" ");
    return {
      id: s.id, n: i + 1, name: s.name, x: s.x, y: s.y, c, ink: ink(c),
      f: Object.fromEntries(filtersCfg.map(f => [f.column, list(r[f.column])])),
      tags: tagCols.flatMap(col => list(r[col]).map(v => ({ v, c: col === colorBy ? (colors[v] || defaultColor) : null }))),
      photo: s.photo ? `images/${s.photo}` : "", alt: r.photo_alt || r.photo_caption || "", caption: cap,
      html: render(siteText.get(s.id)),
    };
  }),
  filters: filtersCfg.map(f => {
    const seen = [...new Set(out.flatMap(s => list(s.raw[f.column])))];
    const vals = f.column === colorBy ? [...Object.keys(colors).filter(k => seen.includes(k)), ...seen.filter(v => !(v in colors))] : seen.sort((a, b) => a.localeCompare(b));
    return { column: f.column, label: f.label || f.column, style: f.style || "dropdown", values: vals.map(v => ({ v, c: f.column === colorBy ? colors[v] || defaultColor : null, ink: ink(colors[v]) })) };
  }),
  legend: colorBy ? { title: ptsCfg.legend_title || "", items: Object.keys(colors).filter(k => out.some(s => list(s.raw[colorBy]).includes(k))).map(k => ({ v: k, c: colors[k] })) } : null,
  labels: { singular: labels.singular, plural: labels.plural, endTitle: labels.end_title, endText: labels.end_text, endButton: labels.end_button },
};

const logo = fs.readFileSync(path.join(SRC, "..", "assets", "cwp-logo.svg"), "utf8").replace("<svg", '<svg class="cwp" role="img" aria-label="Center for Western Priorities"');
let partnerHtml = "";
const partner = cfg.partner || {};
if (partner.logo) {
  if (!exists(partner.logo)) { console.log(`Warning: partner logo "${partner.logo}" not found, so it was left off.`); }
  else {
    const label = esc(partner.name || "Partner");
    const img = partner.logo.toLowerCase().endsWith(".svg")
      ? read(partner.logo).replace(/<\?xml[^>]*\?>/, "").replace(/<svg/, `<svg class="partner" role="img" aria-label="${label}"`)
      : `<img class="partner" src="${esc(partner.logo)}" alt="${label}">`;
    partnerHtml = `<span class="sep" aria-hidden="true"></span>` + (partner.url ? `<a href="${esc(partner.url)}" target="_blank" rel="noopener">${img}</a>` : img);
  }
}
const hero = cfg.hero || {};
const heroImg = hero.image && exists(hero.image) ? hero.image : "";
if (hero.image && !heroImg) console.log(`Warning: hero image "${hero.image}" not found, so the page has no top photo.`);
const dekHtml = render(dekTokens).replace(/<p>/g, '<p class="dek">');
const dekPlain = plain(dekTokens.map(t => t.text || "").join(" "));
const siteUrl = cfg.site_url ? String(cfg.site_url).replace(/\/?$/, "/") : "";
const meta = [
  `<meta name="description" content="${esc(dekPlain)}">`,
  `<meta property="og:type" content="website">`, `<meta property="og:title" content="${esc(title)}">`, `<meta property="og:description" content="${esc(dekPlain)}">`,
  siteUrl ? `<meta property="og:url" content="${esc(siteUrl)}">` : "",
  siteUrl && heroImg ? `<meta property="og:image" content="${esc(siteUrl + heroImg)}">` : "",
  `<meta name="twitter:card" content="${heroImg ? "summary_large_image" : "summary"}">`,
].filter(Boolean).join("\n");
const filtersHtml = data.filters.length ? `<div class="filterband"><div class="wrap"><div class="filters" role="group" aria-label="Filter ${esc(labels.plural)}">${
  data.filters.map((f, i) => f.style === "dropdown"
    ? `<div class="fgroup"><label class="flabel" for="f${i}">${esc(f.label)}</label><select id="f${i}" data-f="${i}"><option value="">All</option>${f.values.map(v => `<option>${esc(v.v)}</option>`).join("")}</select></div>`
    : `<div class="fgroup" data-f="${i}"><span class="flabel">${esc(f.label)}</span>${f.values.map(v => `<button type="button" class="chip" aria-pressed="false" style="${v.c ? `--c:${v.c};--ink:${v.ink}` : "--c:var(--cwp-navy)"}"><span class="dot"></span>${esc(v.v)}</button>`).join("")}</div>`).join("")
}<button class="btn reset" id="resetBtn" type="button">Reset</button><span class="count" id="count" aria-live="polite"></span></div></div></div>` : "";

const fill = {
  meta, title: esc(plain(cfg.page_title) || title), h1: esc(title), eyebrow: esc(cfg.eyebrow ?? "Interactive map"),
  styles: fs.readFileSync(path.join(SRC, "styles.css"), "utf8"), app: fs.readFileSync(path.join(SRC, "app.js"), "utf8"),
  data: JSON.stringify(data).replace(/</g, "\\u003c"), logo, partner: partnerHtml,
  notice: sections.notice ? `<div class="notice" role="note"><div class="wrap">${render(sections.notice)}</div></div>` : "",
  hero: heroImg ? `<div class="hero-img" style="background-image:url(${esc(heroImg)})" role="img" aria-label="${esc(hero.alt || "")}"></div>` : "",
  heroClass: heroImg ? "hero" : "hero no-img", dek: dekHtml, heroCredit: heroImg && hero.credit ? `<p class="hero-credit">${inline(hero.credit)}</p>` : "",
  intro: render(sections.intro), howto: labels.how_to ? `<p class="howto">${inline(labels.how_to)}</p>` : "",
  filters: filtersHtml, mapNote: mapNote ? `<p class="mapnote">${inline(mapNote)}</p>` : "",
  notes: sections.notes ? `<section class="notes"><div class="wrap">${render(sections.notes)}</div></section>` : "",
  footer: inline(cfg.footer ?? "Center for Western Priorities · westernpriorities.org"),
};
const html = fs.readFileSync(path.join(SRC, "template.html"), "utf8").replace(/\{\{(\w+)\}\}/g, (_, k) => fill[k] ?? "");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "index.html"), html);
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
const copy = rel => { const src = path.join(ROOT, rel); if (fs.existsSync(src)) fs.cpSync(src, path.join(OUT, rel), { recursive: true }); };
copy("images");
if (partner.logo && !partner.logo.toLowerCase().endsWith(".svg")) copy(partner.logo);
console.log(`\nBuilt _site/index.html with ${out.length} ${out.length === 1 ? labels.singular : labels.plural}${warnings.length ? ` and ${warnings.length} warning(s)` : ""}.`);
