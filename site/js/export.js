'use strict';

/* ───────────────────────── Export ───────────────────────── */
function tileUrl(B, z, x, y, retina) {
  const sub = B.sub ? B.sub[(x + y) % B.sub.length] : '';
  return B.url.replace('{s}', sub).replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{r}', retina && B.retina ? '@2x' : '');
}
function loadImg(url) { return new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; }); }
async function drawTiles(ctx, map, B, box, s, filter) {
  const zoom = map.getZoom(), z = Math.max(0, Math.min(B.maxNative, Math.round(zoom)));
  const sz = map.getSize();
  const nw = map.project(map.containerPointToLatLng([0, 0]), z), se = map.project(map.containerPointToLatLng([sz.x, sz.y]), z);
  const n = 2 ** z, jobs = [];
  for (let ty = Math.floor(nw.y / 256); ty <= Math.floor(se.y / 256); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(nw.x / 256); tx <= Math.floor(se.x / 256); tx++) {
      const wx = ((tx % n) + n) % n;
      const p0 = map.latLngToContainerPoint(map.unproject(L.point(tx * 256, ty * 256), z));
      const p1 = map.latLngToContainerPoint(map.unproject(L.point((tx + 1) * 256, (ty + 1) * 256), z));
      jobs.push(loadImg(tileUrl(B, z, wx, ty, s >= 1.5)).then(im => ({ im, p0, p1 })));
    }
  }
  const res = await Promise.all(jobs); let fails = 0;
  ctx.save(); if (filter && 'filter' in ctx) ctx.filter = filter;
  for (const r of res) {
    if (!r.im) { fails++; continue; }
    const x0 = Math.floor(box.x * s + r.p0.x * s), y0 = Math.floor(box.y * s + r.p0.y * s);
    const x1 = Math.ceil(box.x * s + r.p1.x * s), y1 = Math.ceil(box.y * s + r.p1.y * s);
    ctx.drawImage(r.im, x0, y0, x1 - x0, y1 - y0);
  }
  ctx.restore();
  return fails;
}
const TONE_FILTER = { full: '', soft: 'saturate(0.5) brightness(1.05)', gray: 'grayscale(1) brightness(1.08) contrast(0.92)' };
async function drawMapBox(ctx, map, kind, box, s, B, filter) {
  ctx.save(); ctx.beginPath(); ctx.rect(box.x * s, box.y * s, box.w * s, box.h * s); ctx.clip();
  ctx.fillStyle = '#EDEFF1'; ctx.fillRect(box.x * s, box.y * s, box.w * s, box.h * s);
  const fails = await drawTiles(ctx, map, B, box, s, filter);
  renderMap(ctx, map, kind, s, box.x * s, box.y * s, false);
  ctx.restore(); return fails;
}
async function renderExport(s) {
  if (editing) closeLabelEditor(true);
  try { await document.fonts.ready; } catch (e) {}
  const Lo = computeLayout();
  const c = document.createElement('canvas'); c.width = Math.round(Lo.W * s); c.height = Math.round(Lo.H * s);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  let fails = await drawMapBox(ctx, mainMap, 'main', Lo.map, s, BASES[state.base], TONE_FILTER[state.tone]);
  if (Lo.overview) fails += await drawMapBox(ctx, overviewMap, 'overview', Lo.overview, s, BASES[OVERVIEW_BASE], 'grayscale(1) brightness(1.1) contrast(0.85)');
  if (Lo.detail) fails += await drawMapBox(ctx, detailMap, 'detail', Lo.detail, s, BASES[state.base], TONE_FILTER[state.tone]);
  drawSheet(ctx, s, Lo);
  return { canvas: c, fails };
}
function toBlob(c) { return new Promise((res, rej) => { try { c.toBlob(b => b ? res(b) : rej(new Error(t('exp.empty'))), 'image/png'); } catch (e) { rej(e); } }); }
const slug = () => (state.title || 'map').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map';
function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
}
async function makeImage(scale) {
  status('exportStatus', t('exp.building'));
  const { canvas, fails } = await renderExport(scale);
  const blob = await toBlob(canvas);
  return { blob, fails, canvas };
}
function failNote(fails) { return fails ? t('exp.fails', { n: fails }) : ''; }
async function exportPng() {
  const s = parseFloat(document.getElementById('pngScale').value) || 2;
  try { const { blob, fails, canvas } = await makeImage(s); downloadBlob(blob, `${t('file.prefix')}-${slug()}.png`); status('exportStatus', t('exp.saved', { w: canvas.width, h: canvas.height }) + failNote(fails), !!fails); }
  catch (e) { status('exportStatus', t('exp.error', { e: e.message }), true); }
}
async function copyImage() {
  try {
    const { blob, fails } = await makeImage(2);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    status('exportStatus', t('copy.ok') + failNote(fails), !!fails);
  } catch (e) { status('exportStatus', t('copy.fail'), true); }
}
async function printImage() {
  const w = window.open('', '_blank');
  if (!w) { status('exportStatus', t('print.blocked'), true); return; }
  w.document.write('<p style="font:14px sans-serif">' + t('print.preparing') + '</p>');
  try {
    const { canvas, fails } = await makeImage(3);
    const url = canvas.toDataURL('image/png'), F = FORMATS[state.format];
    const orient = F.w >= F.h ? 'landscape' : 'portrait';
    w.document.open();
    w.document.write(`<!doctype html><html><head><title>${(state.title || t('app.name')).replace(/</g, '&lt;')}</title><style>@page{size:A4 ${orient};margin:8mm}html,body{margin:0}img{width:100%;height:auto;display:block}</style></head><body><img src="${url}" onload="setTimeout(function(){window.print()},200)"></body></html>`);
    w.document.close();
    status('exportStatus', t('print.ok') + failNote(fails), !!fails);
  } catch (e) { w.close(); status('exportStatus', t('print.fail', { e: e.message }), true); }
}
function saveProject() {
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  downloadBlob(blob, `${t('file.prefix')}-${slug()}.json`); status('exportStatus', t('proj.saved'));
}
function loadProject(e) {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const s = JSON.parse(fr.result); if (!s || s.v !== 1 || !Array.isArray(s.features)) throw new Error(t('proj.notProject'));
      if (editing) closeLabelEditor(true);
      pushHistory(); state = localizeDefaults(merge(defaultState(), s)); selectedId = null; drawing = null;
      syncPanel(); setBase(); applyLayout();
      mainMap.setView(state.main.center, state.main.zoom); detailMap.setView(state.detail.center, state.detail.zoom);
      save(); renderAll(); fetchCity(state.address.parts && state.address.parts.city);
      status('exportStatus', t('proj.opened', { t: state.title || file.name }));
    } catch (err) { status('exportStatus', t('proj.fail', { e: err.message }), true); }
    e.target.value = '';
  };
  fr.readAsText(file);
}

