'use strict';

/* ───────────────────────── Maps ───────────────────────── */
let mainMap, detailMap, overviewMap, baseMain, baseDetail, baseOverview;
const overlays = {};
function makeBase(key) {
  const B = BASES[key] || BASES.osmde;
  return L.tileLayer(B.url, { subdomains: B.sub || 'abc', maxNativeZoom: B.maxNative, maxZoom: 21, crossOrigin: 'anonymous', keepBuffer: 3 });
}
class Overlay {
  constructor(map, kind) {
    this.map = map; this.kind = kind;
    this.c = document.createElement('canvas'); this.c.className = 'feat-canvas';
    map.getContainer().appendChild(this.c);
    this.ctx = this.c.getContext('2d');
    map.on('move zoom viewreset', () => this.draw());
    map.on('resize', () => this.resize());
    this.resize();
  }
  resize() {
    const sz = this.map.getSize(), d = window.devicePixelRatio || 1;
    this.d = d; this.c.width = Math.round(sz.x * d); this.c.height = Math.round(sz.y * d);
    this.c.style.width = sz.x + 'px'; this.c.style.height = sz.y + 'px'; this.draw();
  }
  draw() {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.c.width, this.c.height);
    ctx.setTransform(this.d, 0, 0, this.d, 0, 0);
    renderMap(ctx, this.map, this.kind, 1, 0, 0, true);
  }
}
function renderMap(ctx, map, kind, s, ox, oy, screen) {
  const P = ll => { const p = map.latLngToContainerPoint(ll); return [ox + p.x * s, oy + p.y * s]; };
  const size = map.getSize();
  if (kind === 'overview') return drawOverviewLayer(ctx, P, s, { x: ox, y: oy, w: size.x * s, h: size.y * s });
  for (const f of sortedFeatures()) drawFeature(ctx, f, P, s);
  if (kind === 'main' && state.detail.on && detailMap) drawDetailRect(ctx, P, s);
  if (screen) drawEditing(ctx, map, P, s);
}
function ringsBounds(rings) { return L.latLngBounds(rings.flat()); }
function drawOverviewLayer(ctx, P, s, box) {
  const ov = state.overview;
  ctx.save(); ctx.lineJoin = 'round';
  if (cityRings) {
    ctx.beginPath(); for (const r of cityRings) { r.forEach((ll, i) => { const [x, y] = P(ll); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); }
    ctx.fillStyle = 'rgba(31,42,68,0.05)'; ctx.fill('evenodd'); ctx.strokeStyle = NAVY; ctx.lineWidth = 1.5 * s; ctx.stroke();
  }
  const useArea = ov.rect !== 'main' && ov.areaGeo && ov.areaGeo.length;
  if (useArea) {
    ctx.beginPath(); for (const r of ov.areaGeo) { r.forEach((ll, i) => { const [x, y] = P(ll); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); }
    ctx.fillStyle = 'rgba(214,60,39,0.22)'; ctx.fill('evenodd');
  }
  const b = useArea ? ringsBounds(ov.areaGeo) : mainMap.getBounds();
  let [x1, y1] = P([b.getNorth(), b.getWest()]), [x2, y2] = P([b.getSouth(), b.getEast()]);
  const minS = 10 * s;
  if (x2 - x1 < minS) { const c = (x1 + x2) / 2; x1 = c - minS / 2; x2 = c + minS / 2; }
  if (y2 - y1 < minS) { const c = (y1 + y2) / 2; y1 = c - minS / 2; y2 = c + minS / 2; }
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 5 * s; ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  ctx.strokeStyle = ACC; ctx.lineWidth = 2.2 * s; ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  const a = P([state.address.lat, state.address.lon]);
  ctx.beginPath(); ctx.arc(a[0], a[1], 2.6 * s, 0, 7); ctx.fillStyle = ACC; ctx.fill(); ctx.lineWidth = 1.2 * s; ctx.strokeStyle = '#fff'; ctx.stroke();
  const name = useArea ? ov.areaName : '';
  if (name) {
    const font = `700 ${12.5 * s}px ${FD}`; ctx.font = font; const tw = ctx.measureText(name).width;
    const right = x2 + 6 * s + tw < box.x + box.w - 4 * s;
    haloText(ctx, name, right ? x2 + 6 * s : x1 - 6 * s, (y1 + y2) / 2 + 4 * s, font, s, { align: right ? 'left' : 'right', color: '#A92D1B' });
  }
  ctx.restore();
}
function drawDetailRect(ctx, P, s) {
  const b = detailMap.getBounds();
  const [x1, y1] = P([b.getNorth(), b.getWest()]), [x2, y2] = P([b.getSouth(), b.getEast()]);
  ctx.save();
  ctx.lineWidth = 4 * s; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  ctx.setLineDash([6 * s, 4 * s]); ctx.lineWidth = 1.8 * s; ctx.strokeStyle = NAVY; ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  ctx.restore();
  tag(ctx, t('sheet.closeup'), x1 - 0.9 * s, y1 - 1 * s, s, false);
}
function drawEditing(ctx, map, P, s) {
  const sel = selectedFeature();
  if (sel) {
    const T = TYPES[sel.type];
    ctx.save();
    if (T.kind === 'line' || T.kind === 'poly') {
      const pts = sel.coords.map(P), closed = T.kind === 'poly';
      pathOf(ctx, pts, closed); ctx.strokeStyle = 'rgba(31,111,209,0.30)'; ctx.lineWidth = (T.w || 3) + 10; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
      const n = pts.length, segs = closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = pts[i], b = pts[(i + 1) % n]; ctx.beginPath(); ctx.arc((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 3.6, 0, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = SEL; ctx.stroke();
      }
      for (const p of pts) { ctx.beginPath(); ctx.arc(p[0], p[1], 5.2, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = SEL; ctx.stroke(); }
    } else {
      const [x, y] = P(sel.coords); const [ax, ay] = symbolAnchor(sel.type, x, y, 1);
      ctx.beginPath(); ctx.arc(ax, ay, 17, 0, 7); ctx.setLineDash([4, 3]); ctx.lineWidth = 2; ctx.strokeStyle = SEL; ctx.stroke();
    }
    ctx.restore();
  }
  if (drawing && drawing.map === map) {
    const pts = drawing.coords.map(P);
    if (hover && hover.map === map) pts.push([hover.pt.x, hover.pt.y]);
    const T = TYPES[drawing.type];
    if (pts.length >= 2) { if (T.kind === 'poly') drawPoly(ctx, pts, drawing.type, s); else drawLine(ctx, pts, drawing.type, s, true); }
    ctx.save();
    drawing.coords.map(P).forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 4.2, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = SEL; ctx.stroke(); });
    ctx.restore();
  }
}

