'use strict';

/* ───────────────────────── Sheet layout ───────────────────────── */
const measureCtx = document.createElement('canvas').getContext('2d');
function legendItems() {
  const used = new Set(state.features.map(f => f.type));
  const items = LEGEND_ORDER.filter(k => used.has(k)).map(k => ({ key: k, label: state.legend.labels[k] || defaultLegendLabel(k) }));
  if (state.detail.on) items.push({ key: '_detail', label: state.legend.labels._detail || t('legend.detail') });
  return items;
}
function defaultLegendLabel(k) {
  if (k === 'building') { const hn = state.address.parts && state.address.parts.house_number; return hn ? t('legend.building', { n: hn }) : tn('building'); }
  return tn(k);
}
function legendModel() {
  const ctx = measureCtx, pad = 12, sw = 40, textW = LEG_W - pad * 2 - sw - 10;
  const items = legendItems();
  ctx.font = `500 ${13}px ${FB}`;
  const rows = items.map(it => { const lines = wrap(ctx, it.label, textW); return { it, lines, h: Math.max(26, lines.length * 16 + 10) }; });
  const notes = (state.notes || '').trim();
  ctx.font = `400 ${12.5}px ${FB}`;
  const noteLines = notes ? wrap(ctx, notes, LEG_W - pad * 2) : [];
  if (!rows.length && !noteLines.length) return null;
  let h = pad + (rows.length ? 20 + rows.reduce((s, r) => s + r.h, 0) : 0);
  if (noteLines.length) h += (rows.length ? 10 : 0) + 18 + noteLines.length * 16.5;
  h += pad - 2;
  return { rows, noteLines, h: Math.ceil(h), w: LEG_W, pad, sw };
}
function computeLayout() {
  const F = FORMATS[state.format] || FORMATS.a4l;
  const map = { x: 0, y: HEADER_H, w: F.w, h: F.h - HEADER_H - FOOTER_H };
  const Lo = { W: F.w, H: F.h, map, overview: null, detail: null, legend: null, legendModel: null };
  const boxes = [];
  if (state.overview.on) { const z = OV_SIZE[state.overview.size] || 220; boxes.push({ key: 'overview', w: z, h: z, corner: state.overview.corner }); }
  if (state.detail.on) { const [w, h] = DT_SIZE[state.detail.size] || DT_SIZE.m; boxes.push({ key: 'detail', w, h, corner: state.detail.corner }); }
  if (state.legend.on) { const lm = legendModel(); if (lm) { Lo.legendModel = lm; boxes.push({ key: 'legend', w: lm.w, h: lm.h, corner: state.legend.corner }); } }
  const off = { tl: M, tr: M, bl: M, br: M };
  for (const b of boxes) {
    const c = b.corner in off ? b.corner : 'tr';
    const x = c[1] === 'l' ? map.x + M : map.x + map.w - M - b.w;
    const y = c[0] === 't' ? map.y + off[c] : map.y + map.h - off[c] - b.h;
    off[c] += b.h + 12;
    Lo[b.key] = { x, y, w: b.w, h: b.h, corner: c };
  }
  Lo.freeCorner = CORNER_KEYS.find(c => off[c] === M) || 'tl';
  return Lo;
}
let layout = null;
function applyLayout() {
  layout = computeLayout();
  const sheet = document.getElementById('sheet');
  sheet.style.width = layout.W + 'px'; sheet.style.height = layout.H + 'px';
  const place = (id, b) => { const el = document.getElementById(id); el.hidden = !b; if (b) Object.assign(el.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' }); };
  place('mapMain', layout.map); place('mapOverview', layout.overview); place('mapDetail', layout.detail);
  const sc = document.getElementById('sheetCanvas'), d = window.devicePixelRatio || 1;
  sc.width = Math.round(layout.W * d); sc.height = Math.round(layout.H * d); sc.style.width = layout.W + 'px'; sc.style.height = layout.H + 'px';
  if (mainMap) {
    mainMap.invalidateSize({ pan: false });
    if (layout.detail) detailMap.invalidateSize({ pan: false });
    if (layout.overview) { overviewMap.invalidateSize({ pan: false }); fitOverview(); }
    const pos = { tl: 'topleft', tr: 'topright', bl: 'bottomleft', br: 'bottomright' }[layout.freeCorner];
    mainMap.zoomControl.setPosition(pos);
  }
}
function scaleInfo(map, maxPx) {
  const sz = map.getSize(); if (!sz.x) return null;
  const y = sz.y / 2, a = map.containerPointToLatLng([sz.x / 2 - 50, y]), b = map.containerPointToLatLng([sz.x / 2 + 50, y]);
  const mpp = a.distanceTo(b) / 100, maxM = mpp * maxPx;
  const p = Math.pow(10, Math.floor(Math.log10(maxM)));
  const nice = [5, 2, 1].map(k => k * p).find(v => v <= maxM) || p;
  return { m: nice, px: nice / mpp, label: nice >= 1000 ? (nice / 1000).toLocaleString(lang === 'pl' ? 'pl-PL' : 'en-GB') + ' km' : nice + ' m' };
}
function drawScaleBar(ctx, map, x, y, s, maxPx) {
  const si = scaleInfo(map, maxPx); if (!si) return 0;
  const w = si.px * s, h = 5 * s, n = 4;
  ctx.save();
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#fff' : INK; ctx.fillRect(x + (w / n) * i, y, w / n, h); }
  ctx.strokeStyle = INK; ctx.lineWidth = 1 * s; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = INK; ctx.font = `600 ${11 * s}px ${FB}`; ctx.textBaseline = 'middle'; ctx.fillText(si.label, x + w + 6 * s, y + h / 2 + 0.5 * s);
  const tw = ctx.measureText(si.label).width; ctx.restore();
  return w + 6 * s + tw;
}
function attributionText() {
  const set = new Set([BASES[state.base].attr]); if (state.overview.on) set.add(BASES[OVERVIEW_BASE].attr);
  return t('sheet.attr') + [...set].join(', ');
}
function frame(ctx, b, s) {
  ctx.save();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 5 * s; ctx.strokeRect(b.x * s, b.y * s, b.w * s, b.h * s);
  ctx.strokeStyle = NAVY; ctx.lineWidth = 1.3 * s; ctx.strokeRect((b.x - 2.5) * s, (b.y - 2.5) * s, (b.w + 5) * s, (b.h + 5) * s);
  ctx.restore();
}
function drawLegend(ctx, b, lm, s) {
  const X = v => v * s;
  ctx.save();
  shadowed(ctx, s, () => { ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fillRect(X(b.x), X(b.y), X(b.w), X(b.h)); });
  ctx.strokeStyle = NAVY; ctx.lineWidth = 1.2 * s; ctx.strokeRect(X(b.x), X(b.y), X(b.w), X(b.h));
  let y = b.y + lm.pad;
  if (lm.rows.length) {
    ctx.font = `700 ${11.5 * s}px ${FD}`; setSpacing(ctx, 1.4 * s); ctx.fillStyle = NAVY; ctx.textBaseline = 'top';
    ctx.fillText(t('sheet.legend'), X(b.x + lm.pad), X(y)); setSpacing(ctx, 0);
    y += 20;
    for (const r of lm.rows) {
      const cy = y + r.h / 2;
      drawSample(ctx, r.it.key, X(b.x + lm.pad), X(cy), lm.sw * s, s);
      ctx.font = `500 ${13 * s}px ${FB}`; ctx.fillStyle = INK; ctx.textBaseline = 'middle';
      const ty0 = cy - (r.lines.length - 1) * 8;
      r.lines.forEach((ln, i) => ctx.fillText(ln, X(b.x + lm.pad + lm.sw + 10), X(ty0 + i * 16 + 0.5)));
      y += r.h;
    }
  }
  if (lm.noteLines.length) {
    if (lm.rows.length) { y += 4; ctx.fillStyle = '#D5D9DF'; ctx.fillRect(X(b.x + lm.pad), X(y), X(b.w - lm.pad * 2), Math.max(1, s)); y += 6; }
    ctx.font = `700 ${11.5 * s}px ${FD}`; setSpacing(ctx, 1.4 * s); ctx.fillStyle = NAVY; ctx.textBaseline = 'top';
    ctx.fillText(t('sheet.directions'), X(b.x + lm.pad), X(y)); setSpacing(ctx, 0); y += 18;
    ctx.font = `400 ${12.5 * s}px ${FB}`; ctx.fillStyle = INK;
    lm.noteLines.forEach((ln, i) => ctx.fillText(ln, X(b.x + lm.pad), X(y + i * 16.5)));
  }
  ctx.restore();
}
function drawSheet(ctx, s, Lo) {
  const X = v => v * s;
  // header
  ctx.save();
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, X(Lo.W), X(HEADER_H));
  const rightLabel = t('sheet.label');
  ctx.font = `700 ${12 * s}px ${FD}`; setSpacing(ctx, 1.8 * s);
  const rlw = ctx.measureText(rightLabel).width; ctx.fillStyle = ACC; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(rightLabel, X(Lo.W - 24), X(34)); setSpacing(ctx, 0); ctx.textAlign = 'left';
  const maxTitle = Lo.W - 24 - 40 - rlw / s - 24;
  let fs = 31; ctx.font = `700 ${fs * s}px ${FD}`;
  while (fs > 18 && ctx.measureText(state.title || '').width > X(maxTitle)) { fs -= 1; ctx.font = `700 ${fs * s}px ${FD}`; }
  ctx.fillStyle = INK; ctx.fillText(state.title || '', X(24), X(42));
  ctx.font = `500 ${14.5 * s}px ${FB}`; ctx.fillStyle = '#4A5160';
  ctx.fillText(state.subtitle || '', X(24), X(64));
  ctx.fillStyle = INK; ctx.fillRect(0, X(HEADER_H - 2), X(Lo.W), X(2));
  // footer
  const fy = Lo.H - FOOTER_H;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, X(fy), X(Lo.W), X(FOOTER_H));
  ctx.fillStyle = '#D5D9DF'; ctx.fillRect(0, X(fy), X(Lo.W), Math.max(1, s));
  const sbw = drawScaleBar(ctx, mainMap, X(24), X(fy + 12.5), s, 120);
  const nx = X(24) + sbw + X(22), ny = X(fy + 15);
  ctx.beginPath(); ctx.moveTo(nx, ny - X(7)); ctx.lineTo(nx + X(4.5), ny + X(5)); ctx.lineTo(nx, ny + X(2.5)); ctx.lineTo(nx - X(4.5), ny + X(5)); ctx.closePath(); ctx.fillStyle = INK; ctx.fill();
  ctx.font = `700 ${11 * s}px ${FB}`; ctx.textBaseline = 'middle'; ctx.fillText('N', nx + X(8), ny + X(0.5));
  ctx.font = `400 ${10.5 * s}px ${FB}`; ctx.fillStyle = '#5F6675'; ctx.textAlign = 'right';
  ctx.fillText(attributionText(), X(Lo.W - 24), X(fy + 15.5)); ctx.textAlign = 'left';
  ctx.restore();
  // inset frames
  if (Lo.overview) {
    frame(ctx, Lo.overview, s);
    const city = (state.address.parts && (state.address.parts.city || state.address.parts.town)) || t('sheet.city');
    tag(ctx, city.toLocaleUpperCase(lang === 'pl' ? 'pl-PL' : 'en-GB'), X(Lo.overview.x), X(Lo.overview.y), s, true);
  }
  if (Lo.detail) {
    frame(ctx, Lo.detail, s);
    tag(ctx, t('sheet.closeup'), X(Lo.detail.x), X(Lo.detail.y), s, true);
    const si = scaleInfo(detailMap, 70);
    if (si) {
      const bx = Lo.detail.x + 8, by = Lo.detail.y + Lo.detail.h - 22;
      ctx.save(); ctx.font = `600 ${10.5 * s}px ${FB}`; const tw = ctx.measureText(si.label).width / s;
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fillRect(X(bx), X(by), X(si.px + tw + 20), X(15)); ctx.restore();
      ctx.save(); const w = si.px * s;
      ctx.fillStyle = INK; ctx.fillRect(X(bx + 5), X(by + 9), w, X(2)); ctx.fillRect(X(bx + 5), X(by + 4), X(1.4), X(7)); ctx.fillRect(X(bx + 5) + w - X(1.4), X(by + 4), X(1.4), X(7));
      ctx.font = `600 ${10.5 * s}px ${FB}`; ctx.textBaseline = 'middle'; ctx.fillText(si.label, X(bx + 10) + w, X(by + 8)); ctx.restore();
    }
  }
  if (Lo.legend && Lo.legendModel) drawLegend(ctx, Lo.legend, Lo.legendModel, s);
}
function drawSheetScreen() {
  if (!layout) return;
  const sc = document.getElementById('sheetCanvas'), ctx = sc.getContext('2d'), d = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, sc.width, sc.height);
  ctx.setTransform(d, 0, 0, d, 0, 0); drawSheet(ctx, 1, layout);
}
function redrawAll() {
  for (const k in overlays) overlays[k].draw();
  drawSheetScreen();
}
function layoutChanged(lo) {
  return !layout || lo.W !== layout.W || lo.H !== layout.H || JSON.stringify([lo.legend, lo.overview, lo.detail]) !== JSON.stringify([layout.legend, layout.overview, layout.detail]);
}
function refreshSheet() {
  const lo = computeLayout();
  if (layoutChanged(lo)) applyLayout(); else layout = lo;
  redrawAll();
}
function renderAll() {
  refreshSheet(); renderSelection(); renderLegendEditor(); renderTools();
}

