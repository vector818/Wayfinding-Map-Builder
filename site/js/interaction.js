'use strict';

/* ───────────────────────── Interaction ───────────────────────── */
function screenP(map) { return ll => { const q = map.latLngToContainerPoint(ll); return [q.x, q.y]; }; }
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let k = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; k = Math.max(0, Math.min(1, k));
  return Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dy);
}
function pip(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function hitPoint(map, p) {
  const P = screenP(map);
  for (const f of sortedFeatures().reverse()) {
    const k = TYPES[f.type].kind; if (k !== 'point' && k !== 'text') continue;
    const [x, y] = P(f.coords), [ax, ay] = symbolAnchor(f.type, x, y, 1);
    if (Math.hypot(p[0] - ax, p[1] - ay) < 14) return f;
    if (f.type === 'target' && distSeg(p, [x, y], [ax, ay]) < 9) return f;   // the pin's tip counts too
  }
  return null;
}
function hitFeature(map, pt) {
  const p = [pt.x, pt.y], P = screenP(map);
  const pf = hitPoint(map, p); if (pf) return pf;
  const fs = sortedFeatures().reverse();
  for (const f of fs) if (TYPES[f.type].kind === 'line') { const pts = f.coords.map(P); for (let i = 0; i < pts.length - 1; i++) if (distSeg(p, pts[i], pts[i + 1]) < 7) return f; }
  for (const f of fs) if (TYPES[f.type].kind === 'poly') { const pts = f.coords.map(P); if (pip(p, pts)) return f; }
  return null;
}
function hitHandle(map, pt) {
  const p = [pt.x, pt.y], P = screenP(map), sel = selectedFeature();
  if (sel) {
    const T = TYPES[sel.type];
    if (T.kind === 'line' || T.kind === 'poly') {
      const pts = sel.coords.map(P);
      for (let i = 0; i < pts.length; i++) if (Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]) < 8) return { f: sel, vi: i };
      const n = pts.length, segs = T.kind === 'poly' ? n : n - 1;
      for (let i = 0; i < segs; i++) { const a = pts[i], b = pts[(i + 1) % n]; if (Math.hypot(p[0] - (a[0] + b[0]) / 2, p[1] - (a[1] + b[1]) / 2) < 7) return { f: sel, mid: i }; }
    }
  }
  const f = hitPoint(map, p); if (f) return { f, point: true };
  return null;
}
function bindInteraction(map) {
  const el = map.getContainer();
  el.addEventListener('pointerdown', e => {
    // Clicking the map ends any typing: commit the on-map editor and release the panel field,
    // otherwise the panel would keep showing (and editing) the previous element's label.
    if (editing) closeLabelEditor(true);
    const ae = document.activeElement;
    if (ae && ae !== document.body && ae.closest && ae.closest('#panel')) ae.blur();
    if (e.button !== 0 || mode !== 'select' || drawing) return;
    if (e.target.closest && e.target.closest('.leaflet-control')) return;
    const pt = map.mouseEventToContainerPoint(e), h = hitHandle(map, pt);
    if (!h) return;
    e.preventDefault(); e.stopPropagation();
    const ref = h.point ? h.f.coords : (h.vi != null ? h.f.coords[h.vi] : null);
    const refPt = ref ? map.latLngToContainerPoint(ref) : pt;
    drag = { map, f: h.f, vi: h.vi, mid: h.mid, point: !!h.point, moved: false, x0: e.clientX, y0: e.clientY, off: [refPt.x - pt.x, refPt.y - pt.y], snap: JSON.stringify({ features: state.features, nextNo: state.nextNo }) };
    selectedId = h.f.id; renderSelection(); redrawAll();
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd, { once: true });
  }, true);
  // Double-click an element (select mode) = label it on the map; stops Leaflet's double-click zoom
  el.addEventListener('dblclick', e => {
    if (mode !== 'select' || drawing) return;
    if (e.target.closest && e.target.closest('.leaflet-control')) return;
    const pt = map.mouseEventToContainerPoint(e), f = hitFeature(map, pt);
    if (!f) return;
    e.preventDefault(); e.stopPropagation();
    selectedId = f.id; renderSelection(); redrawAll();
    openLabelEditor(f, map, pt);
  }, true);
  map.on('click', e => onMapClick(map, e));
  map.on('dblclick', e => onMapDblClick(map, e));
  map.on('contextmenu', e => onMapContext(map, e));
  map.on('movestart zoomstart', () => { if (editing) closeLabelEditor(true); });
  map.on('mousemove', e => {
    hover = { map, pt: e.containerPoint };
    if (drawing && drawing.map === map) overlays[map === mainMap ? 'main' : 'detail'].draw();
    if (mode === 'select' && !drag) {
      const h = hitHandle(map, e.containerPoint);
      el.style.cursor = h ? 'move' : (hitFeature(map, e.containerPoint) ? 'pointer' : '');
    }
  });
  map.on('mouseout', () => { if (hover && hover.map === map) { hover = null; if (drawing) redrawAll(); } });
}
function onDragMove(e) {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 3) return;
  if (!drag.moved) {
    drag.moved = true;
    if (drag.mid != null) { const c = drag.f.coords, a = c[drag.mid], b = c[(drag.mid + 1) % c.length]; c.splice(drag.mid + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); drag.vi = drag.mid + 1; drag.mid = null; drag.off = [0, 0]; }
  }
  const pt = drag.map.mouseEventToContainerPoint(e);
  const ll = drag.map.containerPointToLatLng([pt.x + drag.off[0], pt.y + drag.off[1]]);
  const v = [ll.lat, ll.lng];
  if (drag.point) drag.f.coords = v; else if (drag.vi != null) drag.f.coords[drag.vi] = v;
  redrawAll();
}
function onDragEnd() {
  window.removeEventListener('pointermove', onDragMove);
  if (drag && drag.moved) { history.push(drag.snap); suppressClickUntil = Date.now() + 250; save(); }
  drag = null; redrawAll();
}
function onMapClick(map, e) {
  if (Date.now() < suppressClickUntil) return;
  const ll = [e.latlng.lat, e.latlng.lng];
  if (mode === 'select') { const f = hitFeature(map, e.containerPoint); selectedId = f ? f.id : null; renderSelection(); redrawAll(); return; }
  const T = TYPES[mode];
  if (T.kind === 'point' || T.kind === 'text') {
    pushHistory();
    const f = { id: uid(), type: mode, coords: ll, text: '' };
    if (mode === 'entrance') { f.text = String(state.nextNo); state.nextNo = (parseInt(state.nextNo, 10) || 0) + 1; document.getElementById('nextNo').value = state.nextNo; }
    if (mode === 'text') f.text = t('sheet.text');
    state.features.push(f); selectedId = f.id;
    const placed = mode;
    if (placed !== 'entrance') setMode('select');
    save(); renderAll();
    if (placed !== 'entrance') openLabelEditor(f, map, null);
    return;
  }
  if (!drawing) drawing = { type: mode, map, coords: [ll] };
  else if (drawing.map === map) drawing.coords.push(ll);
  redrawAll();
}
function onMapDblClick(map) {
  if (!drawing || drawing.map !== map) return;
  const c = drawing.coords, P = screenP(map);
  while (c.length >= 2) { const a = P(c[c.length - 1]), b = P(c[c.length - 2]); if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 6) c.pop(); else break; }
  finishDrawing();
}
function onMapContext(map, e) {
  if (drawing && drawing.map === map) { finishDrawing(); return; }
  if (mode !== 'select') return;
  const h = hitHandle(map, e.containerPoint);
  if (h && h.vi != null) {
    const min = TYPES[h.f.type].kind === 'poly' ? 3 : 2;
    if (h.f.coords.length > min) { pushHistory(); h.f.coords.splice(h.vi, 1); save(); redrawAll(); }
  }
}
function finishDrawing() {
  if (!drawing) return;
  const T = TYPES[drawing.type], need = T.kind === 'poly' ? 3 : 2;
  if (drawing.coords.length >= need) {
    pushHistory();
    const f = { id: uid(), type: drawing.type, coords: drawing.coords, text: '' };
    state.features.push(f); selectedId = f.id; save();
  }
  drawing = null; setMode('select'); renderAll();
}
function hintFor(m) {
  if (m === 'select' || m === 'entrance' || m === 'text') return t('hint.' + m);
  return t('hint.' + TYPES[m].kind);
}
function setMode(m) {
  if (drawing && drawing.type !== m) drawing = null;
  mode = m;
  for (const map of [mainMap, detailMap]) {
    if (!map) continue;
    const el = map.getContainer(); el.classList.toggle('drawing', m !== 'select'); el.style.cursor = '';
    if (m === 'select') map.doubleClickZoom.enable(); else map.doubleClickZoom.disable();
  }
  document.getElementById('hint').textContent = hintFor(m);
  renderTools(); redrawAll();
}
function deleteSelected() {
  if (!selectedId) return;
  if (editing) closeLabelEditor(false);
  pushHistory(); state.features = state.features.filter(f => f.id !== selectedId); selectedId = null; save(); renderAll();
}
document.addEventListener('keydown', e => {
  const tg = (e.target.tagName || '').toLowerCase(), typing = ['input', 'textarea', 'select'].includes(tg);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
  if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.key === 'Escape') { if (drawing) { drawing = null; redrawAll(); } else if (mode !== 'select') setMode('select'); else { selectedId = null; renderSelection(); redrawAll(); } }
  else if (e.key === 'Enter' && drawing) { e.preventDefault(); finishDrawing(); }
  else if (e.key === 'Enter' && selectedId && mode === 'select') { e.preventDefault(); const f = selectedFeature(); if (f) openLabelEditor(f, mainMap, null); }
  else if (e.key === 'Backspace' && drawing) { e.preventDefault(); drawing.coords.pop(); if (!drawing.coords.length) drawing = null; redrawAll(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); deleteSelected(); }
});

/* ───────────────────────── On-map label editor ───────────────────────── */
function featureAnchorPt(f, map) {
  const T = TYPES[f.type];
  if (T.kind === 'point' || T.kind === 'text') { const q = map.latLngToContainerPoint(f.coords); const [x, y] = symbolAnchor(f.type, q.x, q.y, 1); return { x, y }; }
  const pts = f.coords.map(screenP(map));
  if (T.kind === 'poly') { const [x, y] = polyCentroid(pts); return { x, y }; }
  const W = walk(pts), [x, y] = W.at(W.total / 2); return { x, y };
}
function placeholderFor(type) { const k = 'ph.' + type; return STR[lang][k] != null ? t(k) : t('ph.default'); }
function openLabelEditor(f, map, pt) {
  if (editing) closeLabelEditor(true);
  if (!layout) return;
  let box = map === detailMap ? layout.detail : layout.map;
  if (!box) { map = mainMap; box = layout.map; }
  if (!pt) pt = featureAnchorPt(f, map);
  const ed = document.getElementById('labelEditor'), inp = document.getElementById('labelInput');
  pushHistory();
  editing = { f, original: f.text || '' };
  inp.value = f.text || '';
  inp.placeholder = placeholderFor(f.type);
  ed.hidden = false;
  const w = 250;
  let x = box.x + pt.x + 18, y = box.y + pt.y - 18;
  if (x + w > layout.W - 6) x = box.x + pt.x - w - 18;
  x = Math.max(6, x); y = Math.max(HEADER_H + 4, Math.min(y, layout.H - FOOTER_H - 56));
  ed.style.left = x + 'px'; ed.style.top = y + 'px';
  inp.focus(); inp.select();
}
function closeLabelEditor(commit) {
  if (!editing) return;
  const e = editing; editing = null;
  if (!commit) { e.f.text = e.original; history.pop(); }
  else if ((e.f.text || '') === e.original) history.pop();
  document.getElementById('labelEditor').hidden = true;
  save(); renderSelection(true); redrawAll();
}

