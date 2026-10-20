'use strict';

/* ───────────────────────── Drawing primitives ───────────────────────── */
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function pathOf(ctx, pts, closed) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); if (closed) ctx.closePath(); }
function shadowed(ctx, s, fn) { ctx.save(); ctx.shadowColor = 'rgba(12,18,30,0.28)'; ctx.shadowBlur = 3 * s; ctx.shadowOffsetY = 1 * s; fn(); ctx.restore(); }
function setSpacing(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }
function haloText(ctx, text, x, y, font, s, o = {}) {
  ctx.save(); ctx.font = font; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
  ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = (o.halo || 3.6) * s; ctx.strokeText(text, x, y);
  ctx.fillStyle = o.color || INK; ctx.fillText(text, x, y); ctx.restore();
}
function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean); let line = '';
    if (!words.length) { out.push(''); continue; }
    for (const w of words) { const tt = line ? line + ' ' + w : w; if (ctx.measureText(tt).width > maxW && line) { out.push(line); line = w; } else line = tt; }
    out.push(line);
  }
  return out;
}

function arrowHead(ctx, x, y, ang, sz, color, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(sz * 0.6, 0); ctx.lineTo(-sz * 0.55, sz * 0.62); ctx.lineTo(-sz * 0.25, 0); ctx.lineTo(-sz * 0.55, -sz * 0.62); ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineWidth = 2.2 * s; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}
function walk(pts) {
  const segs = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 0) { segs.push({ a, b, len, start: total }); total += len; }
  }
  const at = d => {
    if (!segs.length) return [pts[0][0], pts[0][1], 0];
    for (const sg of segs) if (d <= sg.start + sg.len) { const k = (d - sg.start) / sg.len; return [sg.a[0] + (sg.b[0] - sg.a[0]) * k, sg.a[1] + (sg.b[1] - sg.a[1]) * k, Math.atan2(sg.b[1] - sg.a[1], sg.b[0] - sg.a[0])]; }
    const sg = segs[segs.length - 1]; return [sg.b[0], sg.b[1], Math.atan2(sg.b[1] - sg.a[1], sg.b[0] - sg.a[0])];
  };
  return { total, at, segs };
}
function drawLine(ctx, pts, type, s, preview) {
  const T = TYPES[type]; if (pts.length < 2) return;
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (type !== 'barrier') {
    pathOf(ctx, pts); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = (T.w + 3.6) * s; ctx.stroke();
  }
  pathOf(ctx, pts); ctx.strokeStyle = T.color; ctx.lineWidth = T.w * s;
  ctx.setLineDash(T.dash ? T.dash.map(d => d * s) : []); ctx.stroke(); ctx.setLineDash([]);
  const W = walk(pts);
  if (T.ticks && W.total > 0) {
    ctx.strokeStyle = T.color; ctx.lineWidth = 2 * s; ctx.lineCap = 'butt';
    for (let d = 4 * s; d < W.total; d += 8 * s) {
      const [x, y, a] = W.at(d), nx = -Math.sin(a), ny = Math.cos(a), h = 5.5 * s;
      ctx.beginPath(); ctx.moveTo(x - nx * h, y - ny * h); ctx.lineTo(x + nx * h, y + ny * h); ctx.stroke();
    }
  }
  if (T.arrows && !preview && W.total > 14 * s) {
    const sz = (T.w * 1.5 + 7) * s, spacing = 120 * s;
    for (let d = spacing * 0.6; d < W.total - spacing * 0.45; d += spacing) { const [x, y, a] = W.at(d); arrowHead(ctx, x, y, a, sz, T.color, s); }
    const [x, y, a] = W.at(Math.max(0, W.total - sz * 0.6)); arrowHead(ctx, x, y, a, sz, T.color, s);
  }
  ctx.restore();
}
function polyCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; a += f; cx += (pts[j][0] + pts[i][0]) * f; cy += (pts[j][1] + pts[i][1]) * f;
  }
  if (Math.abs(a) < 1e-6) { const n = pts.length; return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]; }
  return [cx / (3 * a), cy / (3 * a)];
}
function drawPoly(ctx, pts, type, s) {
  if (pts.length < 2) return;
  ctx.save(); ctx.lineJoin = 'round';
  pathOf(ctx, pts, true);
  if (type === 'building') { ctx.fillStyle = 'rgba(240,138,36,0.42)'; ctx.fill(); ctx.strokeStyle = '#B35A0B'; ctx.lineWidth = 2.2 * s; ctx.stroke(); }
  else { ctx.fillStyle = 'rgba(214,60,39,0.12)'; ctx.fill(); ctx.setLineDash([7 * s, 5 * s]); ctx.strokeStyle = ACC; ctx.lineWidth = 2 * s; ctx.stroke(); }
  ctx.restore();
}

function symbolAnchor(type, x, y, s) { return type === 'target' ? [x, y - 19 * s] : [x, y]; }
function drawSymbol(ctx, type, x, y, s, text) {
  ctx.save(); ctx.lineJoin = 'round';
  const ring = (lw) => { ctx.lineWidth = lw * s; ctx.strokeStyle = '#fff'; ctx.stroke(); };
  switch (type) {
    case 'start': {
      const r = 10.5 * s;
      shadowed(ctx, s, () => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = '#2E8B57'; ctx.fill(); });
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ring(2.4);
      ctx.beginPath(); ctx.moveTo(x - 3.2 * s, y - 5.2 * s); ctx.lineTo(x + 5.4 * s, y); ctx.lineTo(x - 3.2 * s, y + 5.2 * s); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
      break;
    }
    case 'target': {
      const cy = y - 19 * s, r = 11 * s;
      const pin = () => { ctx.beginPath(); ctx.arc(x, cy, r, Math.PI * 0.80, Math.PI * 0.20, false); ctx.lineTo(x, y); ctx.closePath(); };
      shadowed(ctx, s, () => { pin(); ctx.fillStyle = ACC; ctx.fill(); });
      pin(); ring(2.2);
      ctx.beginPath(); ctx.arc(x, cy, 4.3 * s, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      break;
    }
    case 'entrance': {
      const tx = (text == null ? '' : String(text)).trim();
      ctx.font = `700 ${12.5 * s}px ${FB}`;
      const tw = tx ? ctx.measureText(tx).width : 0, w = Math.max(22 * s, tw + 11 * s), h = 22 * s;
      shadowed(ctx, s, () => { rr(ctx, x - w / 2, y - h / 2, w, h, 4 * s); ctx.fillStyle = NAVY; ctx.fill(); });
      rr(ctx, x - w / 2, y - h / 2, w, h, 4 * s); ring(2);
      if (tx) { ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tx, x, y + 0.8 * s); }
      else { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 * s; ctx.strokeRect(x - 3.5 * s, y - 6 * s, 7 * s, 12 * s); ctx.beginPath(); ctx.arc(x + 1.5 * s, y + 0.5 * s, 0.9 * s, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); }
      break;
    }
    case 'gate': {
      const w = 21 * s;
      shadowed(ctx, s, () => { rr(ctx, x - w / 2, y - w / 2, w, w, 3 * s); ctx.fillStyle = '#8A5A2B'; ctx.fill(); });
      rr(ctx, x - w / 2, y - w / 2, w, w, 3 * s); ring(2);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.7 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 6.5 * s, y - 5 * s); ctx.lineTo(x + 6.5 * s, y - 5 * s);
      for (const i of [-1, 0, 1]) { ctx.moveTo(x + i * 4.5 * s, y - 5 * s); ctx.lineTo(x + i * 4.5 * s, y + 6 * s); }
      ctx.stroke();
      break;
    }
    case 'parking': {
      const w = 21 * s;
      shadowed(ctx, s, () => { rr(ctx, x - w / 2, y - w / 2, w, w, 3.5 * s); ctx.fillStyle = '#1F5FBF'; ctx.fill(); });
      rr(ctx, x - w / 2, y - w / 2, w, w, 3.5 * s); ring(2);
      ctx.fillStyle = '#fff'; ctx.font = `700 ${15 * s}px ${FB}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('P', x, y + 1 * s);
      break;
    }
    case 'stop': {
      const r = 11 * s;
      shadowed(ctx, s, () => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = '#F2B705'; ctx.fill(); });
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ring(2.2);
      rr(ctx, x - 5.5 * s, y - 6.8 * s, 11 * s, 11.6 * s, 2.2 * s); ctx.fillStyle = INK; ctx.fill();
      ctx.fillStyle = '#F2B705'; ctx.fillRect(x - 4 * s, y - 5 * s, 8 * s, 4.2 * s);
      ctx.fillStyle = INK; for (const dx of [-3.3, 3.3]) { ctx.beginPath(); ctx.arc(x + dx * s, y + 5.6 * s, 1.6 * s, 0, 7); ctx.fill(); }
      break;
    }
    case 'landmark': {
      const d = 12 * s;
      const sh = () => { ctx.beginPath(); ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath(); };
      shadowed(ctx, s, () => { sh(); ctx.fillStyle = '#6C4BB4'; ctx.fill(); });
      sh(); ring(2);
      ctx.beginPath(); ctx.arc(x, y, 3.2 * s, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      break;
    }
    case 'warning': {
      const sh = () => { ctx.beginPath(); ctx.moveTo(x, y - 12 * s); ctx.lineTo(x + 12.5 * s, y + 9.5 * s); ctx.lineTo(x - 12.5 * s, y + 9.5 * s); ctx.closePath(); };
      shadowed(ctx, s, () => { sh(); ctx.fillStyle = '#F2B705'; ctx.fill(); });
      sh(); ctx.lineWidth = 1.7 * s; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = INK; ctx.font = `700 ${13 * s}px ${FB}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x, y + 3 * s);
      break;
    }
    case 'addr': {
      shadowed(ctx, s, () => { ctx.beginPath(); ctx.arc(x, y, 7 * s, 0, 7); ctx.fillStyle = INK; ctx.fill(); });
      ctx.beginPath(); ctx.arc(x, y, 7 * s, 0, 7); ring(2);
      ctx.beginPath(); ctx.arc(x, y, 2.4 * s, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      break;
    }
  }
  ctx.restore();
}
function pointLabel(ctx, f, x, y, s) {
  if (!f.text || f.type === 'entrance') return;
  let lx = x + 15 * s, ly = y;
  if (f.type === 'target') { lx = x + 15 * s; ly = y - 19 * s; }
  if (f.type === 'addr') lx = x + 11 * s;
  haloText(ctx, f.text, lx, ly + 4.6 * s, `600 ${13 * s}px ${FB}`, s);
}

function drawFeature(ctx, f, P, s) {
  const T = TYPES[f.type]; if (!T) return;
  if (T.kind === 'line') {
    const pts = f.coords.map(P); drawLine(ctx, pts, f.type, s);
    if (f.text && pts.length > 1) { const W = walk(pts), [x, y] = W.at(W.total / 2); haloText(ctx, f.text, x, y - 11 * s, `600 ${13 * s}px ${FB}`, s, { align: 'center', color: T.color === '#26282B' ? INK : T.color }); }
  } else if (T.kind === 'poly') {
    const pts = f.coords.map(P); drawPoly(ctx, pts, f.type, s);
    if (f.text) { const [cx, cy] = polyCentroid(pts); haloText(ctx, f.text, cx, cy, `700 ${15 * s}px ${FB}`, s, { align: 'center', base: 'middle' }); }
  } else if (T.kind === 'point') { const [x, y] = P(f.coords); drawSymbol(ctx, f.type, x, y, s, f.text); pointLabel(ctx, f, x, y, s); }
  else if (T.kind === 'text') { const [x, y] = P(f.coords); haloText(ctx, f.text || t('sheet.text'), x, y, `700 ${14 * s}px ${FB}`, s, { align: 'center', base: 'middle' }); }
}
function tag(ctx, label, x, y, s, inside) {
  ctx.save(); ctx.font = `700 ${11 * s}px ${FD}`; setSpacing(ctx, 1.1 * s);
  const tw = ctx.measureText(label).width, w = tw + 12 * s, h = 17 * s;
  const ty = inside ? y : y - h;
  ctx.fillStyle = NAVY; ctx.fillRect(x, ty, w, h);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + 6 * s, ty + h / 2 + 0.5 * s);
  ctx.restore();
}

/* Sample for the legend / tool icons, centred vertically on cy, spanning x0..x0+w */
function drawSample(ctx, key, x0, cy, w, s) {
  if (key === '_detail') {
    ctx.save(); ctx.setLineDash([5 * s, 3 * s]); ctx.strokeStyle = NAVY; ctx.lineWidth = 1.6 * s; ctx.strokeRect(x0 + 4 * s, cy - 8 * s, w - 8 * s, 16 * s); ctx.restore(); return;
  }
  const T = TYPES[key]; if (!T) return;
  if (T.kind === 'line') drawLine(ctx, [[x0 + 3 * s, cy], [x0 + w - 3 * s, cy]], key, s);
  else if (T.kind === 'poly') drawPoly(ctx, [[x0 + 3 * s, cy - 8 * s], [x0 + w - 3 * s, cy - 8 * s], [x0 + w - 3 * s, cy + 8 * s], [x0 + 3 * s, cy + 8 * s]], key, s);
  else if (T.kind === 'point') {
    const k = 0.82 * s;
    if (key === 'target') drawSymbol(ctx, key, x0 + w / 2, cy + 11 * k, k);
    else drawSymbol(ctx, key, x0 + w / 2, cy, k, key === 'entrance' ? '7' : '');
  } else if (T.kind === 'text') {
    haloText(ctx, 'Abc', x0 + w / 2, cy, `700 ${13 * s}px ${FB}`, s, { align: 'center', base: 'middle' });
  }
}

