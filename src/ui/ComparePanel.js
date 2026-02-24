/**
 * Museum-quality planet comparison panel.
 * Two-planet selector with size visualization SVG and data comparison table.
 */
import { SOLAR_SYSTEM, PLANET_ORDER } from '../data/solarSystem.js';
import { DWARF_PLANETS, DWARF_PLANET_ORDER } from '../data/dwarfPlanets.js';
import { getLocalizedPlanet } from '../i18n/localizedData.js';
import { t } from '../i18n/i18n.js';
import { escapeHTML } from '../utils/sanitize.js';

/** All planet keys available for comparison */
const ALL_KEYS = [...PLANET_ORDER, ...DWARF_PLANET_ORDER];

/** Planet colors as CSS hex */
function colorToCSS(c) {
  if (typeof c === 'string') return c;
  return '#' + c.toString(16).padStart(6, '0');
}

/** Get raw data for a planet key */
function getData(key) {
  return SOLAR_SYSTEM[key] || DWARF_PLANETS[key] || null;
}

/** Parse a numeric value from a display string (e.g. "12,742 km" -> 12742) */
function parseNum(s) {
  if (typeof s === 'number') return s;
  if (!s) return 0;
  const m = String(s).replace(/,/g, '').match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

/** Format a number with locale separators */
function fmtNum(n, decimals = 1) {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

/** Build the planet option list HTML */
function buildOptions() {
  let html = `<option value="">${escapeHTML(t('compare.selectPlanet') || 'Select a planet...')}</option>`;
  for (const key of ALL_KEYS) {
    const p = getLocalizedPlanet(key);
    if (!p) continue;
    html += `<option value="${escapeHTML(key)}">${escapeHTML(p.name)}</option>`;
  }
  return html;
}

/** Build the shell HTML (called by render functions) */
function buildShell() {
  const opts = buildOptions();
  return `<div class="cmp-wrapper">
  <div class="cmp-selectors">
    <div class="cmp-selector" id="cmp-sel-a">
      <div class="cmp-planet-preview" id="cmp-preview-a"></div>
      <select class="cmp-select" id="cmp-planet-a" aria-label="${escapeHTML(t('compare.selectA') || 'Compare planet A')}">${opts}</select>
    </div>
    <div class="cmp-vs">VS</div>
    <div class="cmp-selector" id="cmp-sel-b">
      <div class="cmp-planet-preview" id="cmp-preview-b"></div>
      <select class="cmp-select" id="cmp-planet-b" aria-label="${escapeHTML(t('compare.selectB') || 'Compare planet B')}">${opts}</select>
    </div>
  </div>
  <div class="cmp-size-viz" id="cmp-size-viz" aria-hidden="true" style="display:none;">
    <svg id="cmp-size-svg" viewBox="0 0 400 160"></svg>
    <p class="cmp-size-label" id="cmp-size-label"></p>
  </div>
  <div class="cmp-data-table" id="cmp-data-table">
    <div class="cmp-empty">${escapeHTML(t('compare.pickTwo') || 'Select two planets to compare')}</div>
  </div>
  <div style="text-align:center;">
    <button id="compare-drag-toggle" class="compare-drag-btn">${escapeHTML(t('compare.dragMode') || 'Drag Mode')}</button>
  </div>
  <div id="compare-drag-canvas" style="margin:8px 0;display:none;"></div>
</div>`;
}

/** Update preview circle for a selector */
function updatePreview(side, key) {
  const el = document.getElementById(`cmp-preview-${side}`);
  if (!el) return;
  if (!key) {
    el.style.background = 'rgba(255,255,255,0.08)';
    return;
  }
  const raw = getData(key);
  if (!raw) return;
  const hex = colorToCSS(raw.color);
  el.style.background = `radial-gradient(circle at 35% 35%, ${hex}dd, ${hex}44)`;
}

/** Draw size comparison SVG */
function drawSizeSVG(keyA, keyB) {
  const viz = document.getElementById('cmp-size-viz');
  const svg = document.getElementById('cmp-size-svg');
  const label = document.getElementById('cmp-size-label');
  if (!viz || !svg || !label) return;

  const rawA = getData(keyA);
  const rawB = getData(keyB);
  if (!rawA || !rawB) { viz.style.display = 'none'; return; }

  const pA = getLocalizedPlanet(keyA);
  const pB = getLocalizedPlanet(keyB);

  const rA = rawA.radius;
  const rB = rawB.radius;

  // Determine larger/smaller
  const maxR = Math.max(rA, rB);
  const minR = Math.min(rA, rB);
  const ratio = maxR / minR;

  // Scale: larger gets 70px radius, smaller scales proportionally (min 8px)
  const bigPx = 70;
  const smallPx = Math.max(8, (minR / maxR) * bigPx);

  // Place circles: left = larger, right = smaller
  const isABigger = rA >= rB;
  const leftKey = isABigger ? keyA : keyB;
  const rightKey = isABigger ? keyB : keyA;
  const leftP = isABigger ? pA : pB;
  const rightP = isABigger ? pB : pA;
  const leftRaw = isABigger ? rawA : rawB;
  const rightRaw = isABigger ? rawB : rawA;
  const leftR = bigPx;
  const rightR = smallPx;

  const leftColor = colorToCSS(leftRaw.color);
  const rightColor = colorToCSS(rightRaw.color);

  // Centers: left circle at x=120, right at x=280, both centered at y=75
  const leftCx = 120;
  const rightCx = 280;
  const cy = 75;

  svg.innerHTML = `
    <defs>
      <radialGradient id="grad-left" cx="35%" cy="35%">
        <stop offset="0%" stop-color="${leftColor}" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="${leftColor}" stop-opacity="0.3"/>
      </radialGradient>
      <radialGradient id="grad-right" cx="35%" cy="35%">
        <stop offset="0%" stop-color="${rightColor}" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="${rightColor}" stop-opacity="0.3"/>
      </radialGradient>
    </defs>
    <circle cx="${leftCx}" cy="${cy}" r="${leftR}" fill="url(#grad-left)" opacity="0.85">
      <animate attributeName="r" from="0" to="${leftR}" dur="0.5s" fill="freeze"/>
    </circle>
    <text x="${leftCx}" y="${cy + leftR + 16}" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="11">${escapeHTML(leftP.name)}</text>
    <circle cx="${rightCx}" cy="${cy}" r="${rightR}" fill="url(#grad-right)" opacity="0.85">
      <animate attributeName="r" from="0" to="${rightR}" dur="0.5s" fill="freeze"/>
    </circle>
    <text x="${rightCx}" y="${cy + rightR + 16}" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="11">${escapeHTML(rightP.name)}</text>
  `;

  const ratioStr = fmtNum(ratio, 1);
  label.textContent = `${leftP.name} is ${ratioStr}× larger than ${rightP.name}`;

  viz.style.display = '';
}

/** Comparison rows config: [label i18n key, data accessor, "higher" = winner direction] */
const ROWS = [
  { label: 'compare.diameter', get: p => p.physicalAttributes?.diameter || '—', numeric: p => parseNum(p.physicalAttributes?.diameter), dir: 'high' },
  { label: 'compare.mass', get: p => (p.massEarths || '—') + ' ' + t('unit.earthMass'), numeric: p => parseNum(p.massEarths), dir: 'high' },
  { label: 'compare.gravity', get: p => p.gravity || '—', numeric: p => parseNum(p.gravity), dir: 'high' },
  { label: 'compare.distance', get: p => p.distanceFromSun || '—', numeric: p => parseNum(p.distanceFromSun), dir: 'none' },
  { label: 'compare.year', get: p => p.orbitalPeriod || '—', numeric: () => 0, dir: 'none' },
  { label: 'compare.day', get: p => p.dayLength || '—', numeric: () => 0, dir: 'none' },
  { label: 'compare.moons', get: p => String(p.knownMoons !== undefined ? p.knownMoons : (p.moons ? p.moons.length : 0)), numeric: p => p.knownMoons !== undefined ? p.knownMoons : (p.moons ? p.moons.length : 0), dir: 'high' },
  { label: 'compare.temp', get: p => p.temperature || '—', numeric: () => 0, dir: 'none' },
  { label: 'compare.atmosphere', get: () => '', getAtmo: p => p.atmosphere || '—', numeric: () => 0, dir: 'none' },
];

/** Build the data comparison table */
function buildDataTable(keyA, keyB) {
  const pA = getLocalizedPlanet(keyA);
  const pB = getLocalizedPlanet(keyB);
  if (!pA || !pB) return '';

  let html = '';
  for (const row of ROWS) {
    const valA = row.getAtmo ? row.getAtmo(pA) : row.get(pA);
    const valB = row.getAtmo ? row.getAtmo(pB) : row.get(pB);
    const numA = row.numeric(pA);
    const numB = row.numeric(pB);

    let classA = 'cmp-row-val';
    let classB = 'cmp-row-val';
    if (row.dir === 'high' && numA !== numB && numA > 0 && numB > 0) {
      if (numA > numB) classA += ' cmp-row-val--winner';
      else classB += ' cmp-row-val--winner';
    }

    html += `<div class="cmp-row">
      <div class="cmp-row-label">${escapeHTML(t(row.label) || row.label)}</div>
      <div class="${classA}">${escapeHTML(valA)}</div>
      <div class="${classB}">${escapeHTML(valB)}</div>
    </div>`;
  }
  return html;
}

/** Main update: called when either dropdown changes */
function update() {
  const selA = document.getElementById('cmp-planet-a');
  const selB = document.getElementById('cmp-planet-b');
  const table = document.getElementById('cmp-data-table');
  if (!selA || !selB || !table) return;

  const keyA = selA.value;
  const keyB = selB.value;

  updatePreview('a', keyA);
  updatePreview('b', keyB);

  if (keyA && keyB && keyA !== keyB) {
    drawSizeSVG(keyA, keyB);
    table.innerHTML = buildDataTable(keyA, keyB);
  } else {
    const viz = document.getElementById('cmp-size-viz');
    if (viz) viz.style.display = 'none';
    if (keyA && keyB && keyA === keyB) {
      table.innerHTML = `<div class="cmp-empty">${escapeHTML(t('compare.pickDifferent') || 'Select two different planets')}</div>`;
    } else {
      table.innerHTML = `<div class="cmp-empty">${escapeHTML(t('compare.pickTwo') || 'Select two planets to compare')}</div>`;
    }
  }
}


/** Get raw planet data by key (for drag compare) */
function getDragData(key) {
  return SOLAR_SYSTEM[key] || DWARF_PLANETS[key] || null;
}

/** Render drag-and-drop size comparison canvas */
function renderDragCompare(keyA, keyB) {
  const container = document.getElementById('compare-drag-canvas');
  if (!container) return;

  const dataA = getDragData(keyA);
  const dataB = getDragData(keyB);
  if (!dataA || !dataB) return;

  const pA = getLocalizedPlanet(keyA);
  const pB = getLocalizedPlanet(keyB);

  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 220;
  canvas.style.cssText = 'display:block;margin:0 auto;cursor:grab;border-radius:8px;';
  container.innerHTML = '';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const maxR = Math.max(dataA.radius || 1, dataB.radius || 1);
  const scale = 70 / maxR;

  const rA = (dataA.radius || 1) * scale;
  const rB = (dataB.radius || 1) * scale;

  let posB = { x: 300, y: 110 };
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };

  const colorA = colorToCSS(dataA.color);
  const colorB = colorToCSS(dataB.color);

  const nameA = (pA && pA.name) || keyA;
  const nameB = (pB && pB.name) || keyB;

  const draw = () => {
    ctx.clearRect(0, 0, 400, 220);

    // Background
    ctx.fillStyle = 'rgba(8,12,24,0.95)';
    ctx.fillRect(0, 0, 400, 220);

    // Planet A (fixed left)
    const gradA = ctx.createRadialGradient(100, 110, 0, 100, 110, rA);
    gradA.addColorStop(0, colorA);
    gradA.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.beginPath();
    ctx.arc(100, 110, rA, 0, Math.PI * 2);
    ctx.fillStyle = gradA;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(nameA, 100, 110 + rA + 16);

    // Planet B (draggable)
    const gradB = ctx.createRadialGradient(posB.x, posB.y, 0, posB.x, posB.y, rB);
    gradB.addColorStop(0, colorB);
    gradB.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.beginPath();
    ctx.arc(posB.x, posB.y, rB, 0, Math.PI * 2);
    ctx.fillStyle = gradB;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(nameB, posB.x, posB.y + rB + 16);

    // Overlap info
    const dist = Math.sqrt((posB.x - 100) ** 2 + (posB.y - 110) ** 2);
    if (dist < rA * 0.6) {
      const ratio = Math.round((dataA.radius || 1) / (dataB.radius || 1) * 10) / 10;
      ctx.fillStyle = 'rgba(255,255,200,0.9)';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${nameA} is ${ratio}\xd7 across ${nameB}`, 200, 200);
    }
  };

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (400 / rect.width);
    const my = (e.clientY - rect.top) * (220 / rect.height);
    const dist = Math.sqrt((mx - posB.x) ** 2 + (my - posB.y) ** 2);
    if (dist < rB + 8) {
      dragging = true;
      dragOffset = { x: mx - posB.x, y: my - posB.y };
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (400 / rect.width);
    const my = (e.clientY - rect.top) * (220 / rect.height);
    posB = { x: mx - dragOffset.x, y: my - dragOffset.y };
    draw();
  });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
    canvas.style.cursor = 'grab';
  });

  draw();
}

/** Attach event listeners (call after innerHTML is set) */
export function initCompareListeners() {
  const selA = document.getElementById('cmp-planet-a');
  const selB = document.getElementById('cmp-planet-b');
  if (selA) selA.addEventListener('change', update);
  if (selB) selB.addEventListener('change', update);

  // Wire drag mode toggle
  document.getElementById('compare-drag-toggle')?.addEventListener('click', () => {
    const dragDiv = document.getElementById('compare-drag-canvas');
    if (!dragDiv) return;
    const showing = dragDiv.style.display !== 'none';
    dragDiv.style.display = showing ? 'none' : 'block';
    if (!showing) {
      const keyA = document.getElementById('cmp-planet-a')?.value;
      const keyB = document.getElementById('cmp-planet-b')?.value;
      if (keyA && keyB && keyA !== keyB) renderDragCompare(keyA, keyB);
    }
  });
}

/** Render compare panel — unified for both table and card modes */
export function renderCompareTable() {
  return buildShell();
}

export function renderCompareCards() {
  return buildShell();
}
