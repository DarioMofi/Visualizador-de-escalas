// Constantes y helpers
const R = 6378137, TILE = 256;
const START = { lat: 19.4326, lng: -99.1332, zoom: 12 };
const QUICK_SCALES = [1000, 5000, 10000, 50000, 100000];

const THEME_KEY = 'appTheme';   // 'light' | 'dark'
const SHEET_KEY = 'hudSheet';   // 'expanded' | 'collapsed'
const mmMobile = window.matchMedia('(max-width: 700px)');

const autoDPI = () => Math.round(96 * (window.devicePixelRatio || 1));
const humanScale = n => (n >= 1000 ? `1:${Math.round(n/1000)}k` : `1:${n}`);

// Escala y zoom (WebMercator)
function metersPerPixel(lat, zoom){
  const resEq = (2 * Math.PI * R) / (TILE * Math.pow(2, zoom));
  return resEq * Math.cos(lat * Math.PI / 180);
}
function scaleFromZoom(lat, zoom, dpi){
  return metersPerPixel(lat, zoom) * dpi / 0.0254;
}
function zoomFromScale(lat, scale, dpi){
  const targetMpp = scale * 0.0254 / dpi;
  const resEq = targetMpp / Math.cos(lat * Math.PI / 180);
  return Math.log2((2 * Math.PI * R) / (TILE * resEq));
}

// Tema (UI + basemap)
function getSavedTheme(){
  const t = localStorage.getItem(THEME_KEY);
  if(t === 'light' || t === 'dark') return t;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function setThemeAttr(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  const btn = document.getElementById('btnTheme');
  if(btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
}

// Mapa Leaflet + basemaps por tema
const map = L.map('map', {
  center: [START.lat, START.lng],
  zoom: START.zoom,
  doubleClickZoom: false,
  zoomSnap: 0.01,
  zoomDelta: 0.25,
  wheelPxPerZoomLevel: 120,
  zoomControl: false,
});

L.control.zoom({ position: 'topright' }).addTo(map);

// Basemaps
const basemaps = {
  light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd',
  maxZoom: 20,
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd',
  maxZoom: 20,
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  })
};

// Tema inicial → aplica UI + basemap
let currentTheme = getSavedTheme();
setThemeAttr(currentTheme);
basemaps[currentTheme].addTo(map);

// Control de escala visual
L.control.scale({ metric: true, imperial: false }).addTo(map);

// Toggle de tema
const btnTheme = document.getElementById('btnTheme');
btnTheme.addEventListener('click', ()=>{
  const next = currentTheme === 'light' ? 'dark' : 'light';
  map.removeLayer(basemaps[currentTheme]);
  basemaps[next].addTo(map);
  currentTheme = next;
  setThemeAttr(currentTheme);
});

// HUD (Zoom + Escala ≈)
const zoomLabel  = document.getElementById('zoomLabel');
const scaleLabel = document.getElementById('scaleLabel');
function updateHUD(){
  const z = map.getZoom(), lat = map.getCenter().lat, dpi = autoDPI();
  const scl = scaleFromZoom(lat, z, dpi);
  zoomLabel.textContent  = z.toFixed(2);
  scaleLabel.textContent = `1:${(Math.round(scl/100)*100).toLocaleString()}`;
}
map.on('move zoom', updateHUD);
map.whenReady(updateHUD);

// Escalas rápidas (atajos)
const scaleRibbon = document.getElementById('scaleRibbon');
const selScaleLabel = document.getElementById('selectedScaleLabel');
(function buildScaleRibbon(){
  QUICK_SCALES.forEach(n=>{
    const item = document.createElement('div'); item.className='scale-item';
    const tick = document.createElement('div'); tick.className='scale-tick';
    const btn = document.createElement('button'); btn.className='scale-btn'; btn.textContent = humanScale(n);
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.scale-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      selScaleLabel.textContent = `1:${n.toLocaleString()}`;
      const z = zoomFromScale(map.getCenter().lat, n, autoDPI());
      map.setZoom(z);
    });
    item.appendChild(tick); item.appendChild(btn); scaleRibbon.appendChild(item);
  });
})();

// Medición + cursor-regla
let measuring=false, measureLatLngs=[], measureLine=null, measureMarkers=[];
const lenLabel = document.getElementById('lenLabel'), mapEl = document.getElementById('map');

function formatMeters(m){ return m<1000 ? `${m.toFixed(1)} m` : `${(m/1000).toFixed(3)} km`; }
function recomputeLength(){
  let L=0; for(let i=1;i<measureLatLngs.length;i++){ L += map.distance(measureLatLngs[i-1], measureLatLngs[i]); }
  lenLabel.textContent = formatMeters(L);
  if(measureLine){ measureLine.setLatLngs(measureLatLngs); }
}
function clearMeasure(){
  measureLatLngs=[]; lenLabel.textContent='0 m';
  if(measureLine){ map.removeLayer(measureLine); measureLine=null; }
  measureMarkers.forEach(m=>map.removeLayer(m)); measureMarkers=[];
  
}

document.getElementById('btnMeasure').addEventListener('click', ()=>{
  measuring = !measuring;
  document.getElementById('btnMeasure').classList.toggle('active', measuring);
  mapEl.classList.toggle('measuring', measuring); // ← activa el cursor-regla
});

document.getElementById('btnClear').addEventListener('click', ()=>{
    clearMeasure();
    
    if(measuring) {
        measuring=false;
        document.getElementById('btnMeasure').classList.remove('active');
        mapEl.classList.remove('measuring');
    }
});

map.on('click', (e)=>{
  if(!measuring) return;
  measureLatLngs.push(e.latlng);
  const m = L.circleMarker(e.latlng, { radius:4, weight:2 }).addTo(map);
  measureMarkers.push(m);
  if(!measureLine){ measureLine = L.polyline(measureLatLngs, { weight:3 }).addTo(map); }
  recomputeLength();
});
map.on('dblclick', ()=>{
  measuring=false;
  document.getElementById('btnMeasure').classList.remove('active');
  mapEl.classList.remove('measuring');
});

// MÓVIL: sheet (expandir/colapsar) + ergonomía
function isMobile(){ return mmMobile.matches; }
function getSheetState(){ return localStorage.getItem(SHEET_KEY) || 'expanded'; }
function setSheetState(v){ localStorage.setItem(SHEET_KEY, v); }

function applySheetState(){
  const aside = document.querySelector('aside');
  const btn = document.getElementById('btnSheet');
  if(!isMobile()){
    aside.classList.remove('sheet-collapsed');
    btn?.classList.add('hidden');
    return;
  }
  btn?.classList.remove('hidden');
  const st = getSheetState();
  aside.classList.toggle('sheet-collapsed', st === 'collapsed');
  if(btn){ btn.textContent = (st === 'collapsed') ? '▴' : '▾'; }
  setTimeout(()=> map.invalidateSize(), 220);
}

function setupMobileUI(){
  if(isMobile()){
    map.zoomControl?.setPosition('bottomright');
  }else{
    map.zoomControl?.setPosition('topleft');
  }
  applySheetState();
}

document.addEventListener('DOMContentLoaded', ()=>{
  const btnSheet = document.getElementById('btnSheet');
  if(btnSheet){ btnSheet.addEventListener('click', ()=>{
    const st = getSheetState();
    setSheetState(st === 'collapsed' ? 'expanded' : 'collapsed');
    applySheetState();
  });}

  const grabber = document.querySelector('.mobile-grabber');
  if(grabber){ grabber.addEventListener('click', ()=>{
    const st = getSheetState();
    setSheetState(st === 'collapsed' ? 'expanded' : 'collapsed');
    applySheetState();
  });}

  setupMobileUI();
});

mmMobile.addEventListener('change', ()=>{
  setupMobileUI();
  map.invalidateSize();
});
window.addEventListener('orientationchange', ()=> setTimeout(()=> map.invalidateSize(), 300));
window.addEventListener('resize', ()=>{
  clearTimeout(window.__rsz);
  window.__rsz = setTimeout(()=> map.invalidateSize(), 120);
});
