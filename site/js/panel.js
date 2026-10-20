'use strict';

/* ───────────────────────── Panel ───────────────────────── */
function iconCanvas(cv, key) {
  const d = window.devicePixelRatio || 1, w = 40, h = 26;
  cv.width = w * d; cv.height = h * d; cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, h);
  drawSample(ctx, key, 0, h / 2, w, 1);
}
function buildTools() {
  const box = document.getElementById('tools'); box.innerHTML = '';
  for (const g of TOOL_GROUPS) {
    const lab = document.createElement('div'); lab.className = 'group-label'; lab.textContent = t(g.key); box.appendChild(lab);
    for (const k of g.items) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tool'; b.dataset.type = k; b.setAttribute('aria-pressed', 'false');
      const cv = document.createElement('canvas'); const sp = document.createElement('span'); sp.textContent = tn(k);
      b.append(cv, sp); box.appendChild(b);
      iconCanvas(cv, k);
      b.addEventListener('click', () => setMode(mode === k ? 'select' : k));
    }
  }
  renderTools();
}
function renderTools() {
  document.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === mode)));
}
let lastSelShown = null;
function renderSelection(force) {
  const f = selectedFeature(), box = document.getElementById('selBox');
  box.hidden = !f;
  if (!f) { lastSelShown = null; return; }
  const changed = f.id !== lastSelShown;
  const T = TYPES[f.type], sel = document.getElementById('selType');
  sel.innerHTML = '';
  for (const k of Object.keys(TYPES)) {
    if (TYPES[k].kind !== T.kind) continue;
    const o = document.createElement('option'); o.value = k; o.textContent = tn(k); sel.appendChild(o);
  }
  sel.value = f.type;
  iconCanvas(document.getElementById('selIcon'), f.type);
  const inp = document.getElementById('selText');
  if (changed || force || document.activeElement !== inp) inp.value = f.text || '';
  inp.placeholder = STR[lang]['ph.' + f.type] != null ? t('ph.' + f.type) : t('ph.none');
  document.getElementById('selTextLabel').textContent = f.type === 'entrance' ? t('sel.entrance') : f.type === 'building' ? t('sel.building') : f.type === 'text' ? t('sel.text') : t('sel.other');
  document.getElementById('selReverse').hidden = T.kind !== 'line';
  if (changed) box.scrollIntoView({ block: 'nearest' });
  lastSelShown = f.id;
}
function renderLegendEditor() {
  const box = document.getElementById('legendEdit'), items = legendItems();
  document.getElementById('legendEmpty').hidden = items.some(i => i.key !== '_detail');
  const keys = lang + ':' + items.map(i => i.key).join(',');
  if (box.dataset.keys === keys) return;
  box.dataset.keys = keys; box.innerHTML = '';
  for (const it of items) {
    const row = document.createElement('div'); row.className = 'legend-row';
    const cv = document.createElement('canvas'); iconCanvas(cv, it.key);
    const inp = document.createElement('input'); inp.type = 'text'; inp.id = 'lg-' + it.key;
    inp.placeholder = it.key === '_detail' ? t('legend.detail') : defaultLegendLabel(it.key);
    inp.value = state.legend.labels[it.key] || ''; inp.setAttribute('aria-label', inp.placeholder);
    inp.addEventListener('input', () => { if (inp.value.trim()) state.legend.labels[it.key] = inp.value; else delete state.legend.labels[it.key]; save(); refreshSheet(); });
    row.append(cv, inp); box.appendChild(row);
  }
}
function fillOptions(el, keys, prefix) {
  const cur = el.value; el.innerHTML = '';
  for (const k of keys) { const o = document.createElement('option'); o.value = k; o.textContent = t(prefix + k); el.appendChild(o); }
  if (cur && keys.includes(cur)) el.value = cur;
}
function buildSelects() {
  fillOptions(document.getElementById('format'), Object.keys(FORMATS), 'fmt.');
  fillOptions(document.getElementById('base'), Object.keys(BASES), 'base.');
  document.querySelectorAll('select.corner').forEach(el => fillOptions(el, CORNER_KEYS, 'corner.'));
  document.querySelectorAll('select.size').forEach(el => fillOptions(el, SIZE_KEYS, 'size.'));
}
function buildOvRectOptions() {
  const el = document.getElementById('ovRect'), p = state.address.parts || {}; el.innerHTML = '';
  const opts = [];
  if (p.neighbourhood) opts.push(['neighbourhood', t('ovr.neighbourhood') + p.neighbourhood]);
  if (p.quarter) opts.push(['quarter', t('ovr.quarter') + p.quarter]);
  if (p.suburb) opts.push(['suburb', t('ovr.suburb') + p.suburb]);
  else if (p.city_district) opts.push(['city_district', t('ovr.suburb') + p.city_district]);
  opts.push(['main', t('ovr.main')]);
  for (const [v, txt] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = txt; el.appendChild(o); }
  if (!opts.find(o => o[0] === state.overview.rect)) state.overview.rect = opts[0][0];
  el.value = state.overview.rect;
}
function syncPanel() {
  const v = (id, val) => { document.getElementById(id).value = val; };
  const c = (id, val) => { document.getElementById(id).checked = !!val; };
  v('q', state.address.query || ''); v('title', state.title); v('subtitle', state.subtitle); v('notes', state.notes || '');
  v('format', state.format); v('base', state.base); v('tone', state.tone || 'full');
  c('ovOn', state.overview.on); v('ovCorner', state.overview.corner); v('ovSize', state.overview.size);
  c('dtOn', state.detail.on); v('dtCorner', state.detail.corner); v('dtSize', state.detail.size);
  c('lgOn', state.legend.on); v('lgCorner', state.legend.corner);
  v('nextNo', state.nextNo);
  document.getElementById('legendEdit').dataset.keys = '';
  buildOvRectOptions(); applyTone();
}
function applyTone() {
  for (const id of ['mapMain', 'mapDetail']) { const el = document.getElementById(id); el.classList.toggle('tone-soft', state.tone === 'soft'); el.classList.toggle('tone-gray', state.tone === 'gray'); }
}
function applyStaticText() {
  document.documentElement.lang = lang;
  document.title = t('app.name');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
}
function setLang(l) {
  if (l === lang) return;
  if (editing) closeLabelEditor(true);
  lang = l;
  try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
  const before = JSON.stringify(state.address.parts);
  localizeDefaults(state); save();
  applyStaticText(); buildSelects(); buildTools(); syncPanel();
  document.getElementById('hint').textContent = hintFor(mode);
  for (const id of ['geoStatus', 'ovStatus', 'exportStatus', 'baseStatus']) status(id, '');
  renderSelection(true); renderAll();
  if (JSON.stringify(state.address.parts) !== before) fetchCity(state.address.parts.city);
  relocalizeAddress();
}
function bindPanel() {
  const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
  document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  on('title', 'input', e => { state.title = e.target.value; save(); drawSheetScreen(); });
  on('subtitle', 'input', e => { state.subtitle = e.target.value; save(); drawSheetScreen(); });
  on('notes', 'input', e => { state.notes = e.target.value; save(); refreshSheet(); });
  on('format', 'change', e => { state.format = e.target.value; save(); applyLayout(); redrawAll(); });
  on('base', 'change', e => { state.base = e.target.value; setBase(); save(); drawSheetScreen(); });
  on('tone', 'change', e => { state.tone = e.target.value; applyTone(); save(); });
  on('ovOn', 'change', e => { state.overview.on = e.target.checked; save(); applyLayout(); redrawAll(); });
  on('ovCorner', 'change', e => { state.overview.corner = e.target.value; save(); applyLayout(); redrawAll(); });
  on('ovSize', 'change', e => { state.overview.size = e.target.value; save(); applyLayout(); redrawAll(); });
  on('ovRect', 'change', e => { state.overview.rect = e.target.value; state.overview.areaGeo = null; save(); if (state.overview.rect !== 'main') fetchArea(state.overview.rect); redrawAll(); });
  on('dtOn', 'change', e => { state.detail.on = e.target.checked; save(); applyLayout(); renderAll(); });
  on('dtCorner', 'change', e => { state.detail.corner = e.target.value; save(); applyLayout(); redrawAll(); });
  on('dtSize', 'change', e => { state.detail.size = e.target.value; save(); applyLayout(); redrawAll(); });
  on('lgOn', 'change', e => { state.legend.on = e.target.checked; save(); applyLayout(); redrawAll(); });
  on('lgCorner', 'change', e => { state.legend.corner = e.target.value; save(); applyLayout(); redrawAll(); });
  on('nextNo', 'input', e => { state.nextNo = parseInt(e.target.value, 10) || 0; save(); });
  on('selType', 'change', e => { const f = selectedFeature(); if (!f) return; pushHistory(); f.type = e.target.value; save(); renderAll(); });
  on('selText', 'focus', () => pushHistory());
  on('selText', 'input', e => { const f = selectedFeature(); if (!f) return; f.text = e.target.value; save(); redrawAll(); });
  on('selDelete', 'click', deleteSelected);
  on('selReverse', 'click', () => { const f = selectedFeature(); if (!f) return; pushHistory(); f.coords.reverse(); save(); redrawAll(); });
  on('labelInput', 'input', e => { if (!editing) return; editing.f.text = e.target.value; const p = document.getElementById('selText'); if (selectedId === editing.f.id) p.value = e.target.value; redrawAll(); });
  on('labelInput', 'keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); closeLabelEditor(true); }
    else if (e.key === 'Escape') { e.preventDefault(); closeLabelEditor(false); }
  });
  on('labelInput', 'blur', () => { if (editing) closeLabelEditor(true); });
  on('btnUndo', 'click', undo);
  let clearArmed = 0, clearTimer = null;
  on('btnClear', 'click', e => {
    const b = e.currentTarget;
    if (Date.now() - clearArmed > 3500) {
      clearArmed = Date.now(); b.textContent = t('clear.confirm');
      clearTimeout(clearTimer); clearTimer = setTimeout(() => { b.textContent = t('btn.clear'); }, 3500); return;
    }
    clearArmed = 0; clearTimeout(clearTimer); b.textContent = t('btn.clear');
    pushHistory(); state.features = state.features.filter(f => f.auto); state.nextNo = 1; selectedId = null; drawing = null; save(); syncPanel(); renderAll();
  });
  on('searchForm', 'submit', e => { e.preventDefault(); const q = document.getElementById('q').value.trim(); if (q) searchAddress(q); });
  on('btnRecenter', 'click', recenter);
  on('btnEntrances', 'click', fetchEntrances);
  on('btnPng', 'click', exportPng);
  on('btnCopy', 'click', copyImage);
  on('btnPrint', 'click', printImage);
  on('btnSave', 'click', saveProject);
  on('btnLoad', 'click', () => document.getElementById('fileLoad').click());
  on('fileLoad', 'change', loadProject);
}
function setBase() {
  mainMap.removeLayer(baseMain); detailMap.removeLayer(baseDetail);
  baseMain = makeBase(state.base).addTo(mainMap); baseDetail = makeBase(state.base).addTo(detailMap);
  probeBase();
}
function status(id, msg, err) { const el = document.getElementById(id); el.textContent = msg || ''; el.classList.toggle('err', !!err); }

/* Checks one tile of the chosen base map; if the server refuses, switches to the next one. */
let probeRun = 0;
async function probeBase() {
  const run = ++probeRun;
  const c = mainMap.getCenter(), z = 15, n = 2 ** z;
  const x = Math.floor((c.lng + 180) / 360 * n), r = c.lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
  for (const key of [state.base, ...BASE_FALLBACK.filter(k => k !== state.base)]) {
    if (!BASES[key]) continue;
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch(tileUrl(BASES[key], z, x, y, false), { mode: 'cors', signal: ctl.signal });
      clearTimeout(tm);
      if (run !== probeRun) return;
      if (res.ok) {
        if (key !== state.base) {
          const was = t('base.' + state.base);
          state.base = key; document.getElementById('base').value = key; save();
          mainMap.removeLayer(baseMain); detailMap.removeLayer(baseDetail);
          baseMain = makeBase(key).addTo(mainMap); baseDetail = makeBase(key).addTo(detailMap); drawSheetScreen();
          status('baseStatus', t('base.switched', { was, now: t('base.' + key) }), true);
        } else status('baseStatus', '');
        return;
      }
    } catch (e) { if (run !== probeRun) return; }
  }
  status('baseStatus', t('base.none'), true);
}

