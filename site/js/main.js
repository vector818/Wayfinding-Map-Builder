'use strict';

/* ───────────────────────── Start ───────────────────────── */
function init() {
  applyStaticText(); buildSelects(); bindPanel(); buildTools(); syncPanel();
  applyLayout();
  const common = { attributionControl: false, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110, zoomAnimation: false, markerZoomAnimation: false, maxZoom: 21, keyboard: false, boxZoom: false };
  mainMap = L.map('mapMain', { ...common, minZoom: 5 }).setView(state.main.center, state.main.zoom);
  detailMap = L.map('mapDetail', { ...common, minZoom: 12 }).setView(state.detail.center, state.detail.zoom);
  overviewMap = L.map('mapOverview', { attributionControl: false, zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false, zoomSnap: 0.05, zoomAnimation: false, inertia: false }).setView(state.main.center, 10);
  baseMain = makeBase(state.base).addTo(mainMap); baseDetail = makeBase(state.base).addTo(detailMap);
  baseOverview = makeBase(OVERVIEW_BASE).addTo(overviewMap);
  detailMap.zoomControl.setPosition('topright');
  overlays.main = new Overlay(mainMap, 'main');
  overlays.detail = new Overlay(detailMap, 'detail');
  overlays.overview = new Overlay(overviewMap, 'overview');
  mainMap.on('move', () => { overlays.overview.draw(); drawSheetScreen(); });
  mainMap.on('moveend', () => { const c = mainMap.getCenter(); state.main = { center: [c.lat, c.lng], zoom: mainMap.getZoom() }; save(); });
  detailMap.on('move', () => { overlays.main.draw(); drawSheetScreen(); });
  detailMap.on('moveend', () => { const c = detailMap.getCenter(); state.detail = { ...state.detail, center: [c.lat, c.lng], zoom: detailMap.getZoom() }; save(); });
  bindInteraction(mainMap); bindInteraction(detailMap);
  applyLayout(); setMode('select'); renderAll();
  probeBase();
  if (firstRun) {
    // first start: look up the default address; afterwards the last address is restored from localStorage
    searchAddress(state.address.query).then(() => { history.length = 0; });
  } else {
    fetchCity((state.address.parts && state.address.parts.city) || DEFAULTS[lang].parts.city);
    if (state.overview.rect !== 'main' && !state.overview.areaGeo) fetchArea(state.overview.rect);
  }
  if (document.fonts) document.fonts.ready.then(() => { document.querySelectorAll('.tool').forEach(b => iconCanvas(b.querySelector('canvas'), b.dataset.type)); renderAll(); });
}
init();
