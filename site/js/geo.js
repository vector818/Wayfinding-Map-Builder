'use strict';

/* ───────────────────────── Geocoding (Nominatim / Overpass) ───────────────────────── */
let nomiChain = Promise.resolve(), lastNomi = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function nominatim(path, params) {
  const p = nomiChain.then(async () => {
    const wait = lastNomi + 1100 - Date.now(); if (wait > 0) await sleep(wait);
    lastNomi = Date.now();
    const url = 'https://nominatim.openstreetmap.org/' + path + '?' + new URLSearchParams({ format: 'jsonv2', 'accept-language': lang, ...params });
    const r = await fetch(url); if (!r.ok) throw new Error(t('geo.code', { c: r.status }));
    return r.json();
  });
  nomiChain = p.catch(() => {});
  return p;
}
function toRings(g) {
  if (!g) return null;
  if (g.type === 'Polygon') return [g.coordinates[0].map(c => [c[1], c[0]])];
  if (g.type === 'MultiPolygon') return g.coordinates.map(pg => pg[0].map(c => [c[1], c[0]]));
  return null;
}
let lastResults = [];
async function searchAddress(q) {
  status('geoStatus', t('geo.searching'));
  document.getElementById('results').innerHTML = '';
  try {
    const res = await nominatim('search', { q, addressdetails: 1, limit: 6, polygon_geojson: 1, polygon_threshold: 0.000005 });
    lastResults = res;
    if (!res.length) { status('geoStatus', t('geo.notFound'), true); return; }
    renderResults(0); chooseResult(res[0], q);
  } catch (err) {
    status('geoStatus', t('geo.error', { e: err.message }), true);
  }
}
function renderResults(active) {
  const box = document.getElementById('results'); box.innerHTML = '';
  if (lastResults.length < 2) return;
  lastResults.forEach((r, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'result'; b.textContent = r.display_name;
    b.setAttribute('aria-current', String(i === active));
    b.addEventListener('click', () => { renderResults(i); chooseResult(r, document.getElementById('q').value.trim()); });
    box.appendChild(b);
  });
}
function addressParts(a) {
  return { road: a.road || a.pedestrian || a.footway || '', house_number: a.house_number || '', neighbourhood: a.neighbourhood || '', quarter: a.quarter || '', suburb: a.suburb || '', city_district: a.city_district || '', city: a.city || a.town || a.village || '' };
}
function makeSubtitle(parts) {
  return [parts.city, parts.suburb || parts.city_district].filter(Boolean).join(', ') + ((parts.quarter || parts.neighbourhood) ? ' · ' + (parts.quarter || parts.neighbourhood) : '');
}
/* After a language switch: re-read the place names of the current address in the new language.
   Skipped when the user has edited the subtitle by hand. */
const subtitleIsAuto = () => state.subtitle === state.autoSubtitle || state.subtitle === makeSubtitle(state.address.parts || {});
async function relocalizeAddress() {
  const osm = state.address.osm || '', l = lang;
  if (!/^[NWR]\d+$/.test(osm) || !subtitleIsAuto()) return;
  try {
    const res = await nominatim('lookup', { osm_ids: osm, addressdetails: 1 });
    if (l !== lang || osm !== state.address.osm || !subtitleIsAuto() || !res.length) return;
    const parts = addressParts(res[0].address || {});
    state.address.parts = parts;
    state.subtitle = state.autoSubtitle = makeSubtitle(parts);
    if (state.overview.rect !== 'main') state.overview.areaName = parts[state.overview.rect] || state.overview.areaName;
    syncPanel(); save(); renderAll();
    fetchCity(parts.city);
  } catch (e) {}
}
function chooseResult(r, q) {
  pushHistory();
  if (editing) closeLabelEditor(true);
  const a = r.address || {};
  const parts = addressParts(a);
  state.address = { query: q, lat: +r.lat, lon: +r.lon, osm: (r.osm_type ? r.osm_type[0].toUpperCase() : '') + r.osm_id, parts };
  state.features = state.features.filter(f => !f.auto);
  const rings = (r.category === 'building' || r.addresstype === 'building' || r.place_rank >= 28) ? toRings(r.geojson) : null;
  if (rings) rings.forEach((ring, i) => { const c = ring.slice(); if (c.length > 1 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) c.pop(); state.features.unshift({ id: 'osm-b' + i, type: 'building', coords: c, text: i === 0 ? parts.house_number : '', auto: true }); });
  else state.features.push({ id: 'osm-a', type: 'addr', coords: [+r.lat, +r.lon], text: parts.house_number, auto: true });
  const title = [parts.road, parts.house_number].filter(Boolean).join(' ') || r.name || q;
  const sub = makeSubtitle(parts);
  state.title = title; state.subtitle = state.autoSubtitle = sub;
  state.overview.rect = parts.quarter ? 'quarter' : parts.neighbourhood ? 'neighbourhood' : parts.suburb ? 'suburb' : 'main';
  state.overview.areaGeo = null; state.overview.areaName = parts[state.overview.rect] || '';
  state.nextNo = 1; selectedId = null;
  recenter();
  status('geoStatus', rings ? t('geo.building') : t('geo.point'));
  syncPanel(); save(); renderAll();
  if (state.overview.rect !== 'main') fetchArea(state.overview.rect);
  fetchCity(parts.city);
}
function recenter() {
  const b = state.features.filter(f => f.type === 'building' && f.auto);
  const center = [state.address.lat, state.address.lon];
  if (b.length) {
    const bounds = L.latLngBounds(b.flatMap(f => f.coords));
    mainMap.setView(bounds.getCenter(), 17);
    detailMap.fitBounds(bounds, { padding: [24, 24], maxZoom: 19.5 });
  } else { mainMap.setView(center, 17); detailMap.setView(center, 19); }
}
async function fetchArea(level) {
  const p = state.address.parts || {}, name = p[level];
  if (!name) return;
  status('ovStatus', t('ov.loading', { n: name }));
  try {
    const res = await nominatim('search', { q: [name, p.city].filter(Boolean).join(', '), polygon_geojson: 1, polygon_threshold: 0.0002, limit: 5 });
    const hit = res.find(x => x.geojson && /Polygon/.test(x.geojson.type));
    if (!hit) throw new Error('no outline');
    if (state.overview.rect !== level) return;
    state.overview.areaName = name; state.overview.areaGeo = toRings(hit.geojson);
    status('ovStatus', ''); save(); redrawAll();
  } catch (err) {
    state.overview.areaName = name; state.overview.areaGeo = null;
    status('ovStatus', t('ov.fail', { n: name }), true);
    redrawAll();
  }
}
async function fetchCity(name) {
  if (!name) { cityRings = null; fitOverview(); return; }
  try { const c = localStorage.getItem(CITY_KEY + name); if (c) { cityRings = JSON.parse(c); fitOverview(); redrawAll(); return; } } catch (e) {}
  try {
    const res = await nominatim('search', { q: name, featureType: 'city', polygon_geojson: 1, polygon_threshold: 0.0015, limit: 1 });
    const hit = res.find(x => x.geojson && /Polygon/.test(x.geojson.type));
    cityRings = hit ? toRings(hit.geojson) : null;
    if (cityRings) { try { localStorage.setItem(CITY_KEY + name, JSON.stringify(cityRings)); } catch (e) {} }
  } catch (e) { cityRings = null; }
  fitOverview(); redrawAll();
}
function fitOverview() {
  if (!overviewMap || !layout || !layout.overview) return;
  const b = cityRings ? ringsBounds(cityRings) : null;
  const here = L.latLng(state.address.lat, state.address.lon);
  if (!b || !b.contains(here)) { overviewMap.setView(here, 10, { animate: false }); return; }
  overviewMap.fitBounds(b, { padding: [10, 10], animate: false });
}
async function fetchEntrances() {
  const osm = state.address.osm || '';
  if (!/^[WR]\d+$/.test(osm)) { status('geoStatus', t('ent.needBuilding'), true); return; }
  const id = osm.slice(1);
  const q = osm[0] === 'W' ? `[out:json][timeout:20];way(${id});node(w)[entrance];out body;` : `[out:json][timeout:20];rel(${id});way(r);node(w)[entrance];out body;`;
  status('geoStatus', t('ent.searching'));
  let data = null, lastErr = '';
  for (const ep of OVERPASS) {
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 25000);
      const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
      clearTimeout(tm);
      if (!r.ok) { lastErr = t('err.code', { c: r.status }); continue; }
      data = await r.json(); break;
    } catch (e) { lastErr = e.name === 'AbortError' ? t('err.timeout') : e.message; }
  }
  if (!data) { status('geoStatus', t('ent.overloaded', { e: lastErr }), true); return; }
  const nodes = (data.elements || []).filter(e => e.type === 'node');
  if (!nodes.length) { status('geoStatus', t('ent.none')); return; }
  pushHistory();
  const P = screenP(detailMap); let added = 0, numbered = 0;
  for (const n of nodes) {
    const ll = [n.lat, n.lon], p = P(ll);
    if (state.features.some(f => f.type === 'entrance' && Math.hypot(...P(f.coords).map((v, i) => v - p[i])) < 6)) continue;
    const ref = (n.tags && (n.tags.ref || n.tags['addr:unit'] || n.tags['addr:staircase'])) || '';
    if (ref) numbered++;
    state.features.push({ id: uid(), type: 'entrance', coords: ll, text: ref }); added++;
  }
  save(); renderAll();
  status('geoStatus', t('ent.added', { a: added, n: numbered }));
}

