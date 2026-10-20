'use strict';

if (!window.L) {
  const d = document.createElement('div'); d.id = 'fatal';
  d.textContent = 'Nie wczytała się biblioteka mapy (Leaflet) – sprawdź internet i odśwież stronę. / The map library (Leaflet) did not load – check your connection and reload.';
  document.body.appendChild(d);
  throw new Error('Leaflet not loaded');
}

/* ───────────────────────── Constants ───────────────────────── */
const STORE_KEY = 'wayfindingMapBuilder.v1';
const CITY_KEY = 'wayfindingMapBuilder.city.';
const FD = "'Barlow Condensed','Arial Narrow',Arial,sans-serif";
const FB = "'Barlow','Segoe UI',Arial,sans-serif";
const INK = '#16181D', NAVY = '#1F2A44', ACC = '#D63C27', SEL = '#1F6FD1';
const HEADER_H = 80, FOOTER_H = 30, M = 14, LEG_W = 262;

/* A file opened from disk (file://) sends no Referer header, and tile.openstreetmap.org then
   answers with an "Access blocked" tile. For a local file we use servers that accept such
   requests; osm.org is offered only when the tool is served over http(s), e.g. from Docker. */
const LOCAL_FILE = location.protocol === 'file:' || location.origin === 'null';
const BASES = {
  osmde: { url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', maxNative: 18, attr: 'OpenStreetMap Deutschland' },
  hot:   { url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', sub: 'abc', maxNative: 19, attr: 'OSM Humanitarian (HOT, OSM France)' },
  osmfr: { url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', sub: 'abc', maxNative: 18, attr: 'OSM France' },
  osm:   { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxNative: 19, attr: 'OpenStreetMap' }
};
if (LOCAL_FILE) delete BASES.osm;
const BASE_FALLBACK = ['osmde', 'hot', 'osmfr'];
const OVERVIEW_BASE = 'hot';   // local place names (the German style labels Warsaw "Warschau")
const FORMATS = { a4l: { w: 1123, h: 794 }, a4p: { w: 794, h: 1123 }, wide: { w: 1280, h: 720 }, phone: { w: 540, h: 960 }, sq: { w: 900, h: 900 } };
const CORNER_KEYS = ['tl', 'tr', 'bl', 'br'];
const SIZE_KEYS = ['s', 'm', 'l'];
const OV_SIZE = { s: 170, m: 220, l: 280 };
const DT_SIZE = { s: [250, 190], m: [320, 240], l: [410, 300] };
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

const TYPES = {
  route:    { kind: 'line',  color: ACC,       w: 5,   arrows: true },
  alt:      { kind: 'line',  color: ACC,       w: 3.4, dash: [9, 7], arrows: true },
  footpath: { kind: 'line',  color: '#2F7D46', w: 4,   dash: [0.1, 7.5] },
  car:      { kind: 'line',  color: '#1F5FBF', w: 4.5, arrows: true },
  barrier:  { kind: 'line',  color: '#26282B', w: 2.4, ticks: true },
  building: { kind: 'poly' },
  area:     { kind: 'poly' },
  target:   { kind: 'point' },
  entrance: { kind: 'point' },
  start:    { kind: 'point' },
  gate:     { kind: 'point' },
  parking:  { kind: 'point' },
  stop:     { kind: 'point' },
  landmark: { kind: 'point' },
  warning:  { kind: 'point' },
  addr:     { kind: 'point' },
  text:     { kind: 'text' }
};
const DRAW_ORDER = ['building','area','footpath','barrier','car','alt','route','addr','gate','parking','stop','landmark','warning','start','entrance','target','text'];
const LEGEND_ORDER = ['target','entrance','start','route','alt','footpath','car','barrier','building','area','gate','parking','stop','landmark','warning','addr'];
const TOOL_GROUPS = [
  { key: 'grp.lines', items: ['route','alt','footpath','car','barrier'] },
  { key: 'grp.points', items: ['target','entrance','start','gate','parking','stop','landmark','warning','text'] },
  { key: 'grp.areas', items: ['building','area'] }
];

