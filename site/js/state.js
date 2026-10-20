'use strict';

/* ───────────────────────── State ───────────────────────── */
function defaultState() {
  const D = DEFAULTS[lang];
  return {
    v: 1,
    title: 'Plac Defilad 1',
    subtitle: D.subtitle,
    notes: '',
    format: 'a4l',
    base: 'osmde',
    tone: 'soft',
    address: { query: D.query, lat: 52.2317657, lon: 21.0057979, osm: 'R1319250', parts: { ...D.parts } },
    main: { center: [52.2317657, 21.0057979], zoom: 17 },
    detail: { on: true, corner: 'br', size: 'm', center: [52.2317657, 21.0057979], zoom: 17.75 },
    overview: { on: true, corner: 'tr', size: 'm', rect: 'suburb', areaName: 'Śródmieście', areaGeo: null },
    legend: { on: true, corner: 'bl', labels: {} },
    nextNo: 1,
    features: []   // the building outline is fetched from OSM on first start (see init)
  };
}
function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
function merge(base, over) {
  if (!isObj(over)) return base;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = (isObj(base[k]) && isObj(over[k])) ? merge(base[k], over[k]) : over[k];
  return out;
}
/* Swap the built-in example's place names to the current language; user-entered text is left alone */
function localizeDefaults(s) {
  const D = DEFAULTS[lang];
  for (const L of Object.values(DEFAULTS)) {
    if (s.subtitle === L.subtitle) s.subtitle = D.subtitle;
    if (s.address && s.address.query === L.query) s.address.query = D.query;
    const p = s.address && s.address.parts;
    if (p && s.address.osm === 'R1319250' && p.city === L.parts.city && p.suburb === L.parts.suburb) s.address.parts = { ...D.parts };
  }
  if (!BASES[s.base]) s.base = 'osmde';
  return s;
}
let firstRun = true;   // no saved state yet: init() looks up the default address
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const s = JSON.parse(raw); if (s && s.v === 1) { firstRun = false; return localizeDefaults(merge(defaultState(), s)); } }
  } catch (e) {}
  return defaultState();
}
let state = loadState();
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }, 300);
}

let mode = 'select';
let drawing = null;           // {type, map, coords}
let hover = null;             // {map, pt}
let selectedId = null;
let drag = null;
let editing = null;           // on-map label editor: {f, original}
let suppressClickUntil = 0;
let cityRings = null;
const history = [];
function pushHistory() {
  history.push(JSON.stringify({ features: state.features, nextNo: state.nextNo }));
  if (history.length > 80) history.shift();
}
function undo() {
  if (drawing) { drawing.coords.pop(); if (!drawing.coords.length) drawing = null; redrawAll(); return; }
  const h = history.pop(); if (!h) return;
  const o = JSON.parse(h); state.features = o.features; state.nextNo = o.nextNo;
  if (!state.features.find(f => f.id === selectedId)) selectedId = null;
  document.getElementById('nextNo').value = state.nextNo;
  save(); renderAll(); renderSelection(true);
}
const uid = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const selectedFeature = () => state.features.find(f => f.id === selectedId) || null;
const sortedFeatures = () => state.features.slice().sort((a, b) => DRAW_ORDER.indexOf(a.type) - DRAW_ORDER.indexOf(b.type));

