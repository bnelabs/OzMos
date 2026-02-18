/**
 * Planet comparison table generator with visual enhancements.
 */
import { getLocalizedComparisonData } from '../i18n/localizedData.js';
import { t } from '../i18n/i18n.js';

/** Convert THREE.js Color hex int to CSS hex string */
function colorToHex(c) {
  if (typeof c === 'string') return c;
  return '#' + c.toString(16).padStart(6, '0');
}

/** Calculate relative dot size (Jupiter = max) */
function relativeSize(displayRadius, maxRadius, maxPx = 40) {
  return Math.max(6, Math.round((displayRadius / maxRadius) * maxPx));
}

export function renderCompareTable() {
  const data = getLocalizedComparisonData();
  const maxR = Math.max(...data.map(p => p.displayRadius));

  let html = `<div class="compare-table-wrapper"><table class="compare-table">
    <thead>
      <tr>
        <th>${t('compare.planet')}</th>
        <th>${t('compare.type')}</th>
        <th>${t('compare.diameter')}</th>
        <th>${t('compare.mass')}</th>
        <th>${t('compare.gravity')}</th>
        <th>${t('compare.day')}</th>
        <th>${t('compare.year')}</th>
        <th>${t('compare.moons')}</th>
        <th>${t('compare.temp')}</th>
      </tr>
    </thead>
    <tbody>`;

  for (const planet of data) {
    const hex = colorToHex(planet.color);
    const dotSize = relativeSize(planet.displayRadius, maxR);
    html += `
      <tr>
        <td class="planet-name">
          <span class="compare-planet-dot" style="background: ${hex}; width: ${dotSize}px; height: ${dotSize}px;"></span>
          ${planet.name}
        </td>
        <td>${planet.type}</td>
        <td>${planet.diameter}</td>
        <td>${planet.mass}</td>
        <td>${planet.gravity}</td>
        <td>${planet.dayLength}</td>
        <td>${planet.year}</td>
        <td>${planet.moons > 0 ? planet.moons + ' ' + t('compare.known') : '0'}</td>
        <td>${planet.temperature}</td>
      </tr>`;
  }

  html += `</tbody></table></div>`;

  // Size comparison bar
  html += renderSizeBar(data, maxR);

  return html;
}

export function renderCompareCards() {
  const data = getLocalizedComparisonData();
  const maxR = Math.max(...data.map(p => p.displayRadius));

  let html = '<div class="compare-cards">';

  for (const planet of data) {
    const hex = colorToHex(planet.color);
    const dotSize = relativeSize(planet.displayRadius, maxR, 64);
    html += `
      <div class="compare-card" style="border-top: 3px solid ${hex};">
        <div class="compare-card-header" style="background: linear-gradient(135deg, ${hex}22 0%, transparent 60%);">
          <span class="compare-planet-dot" style="background: ${hex}; width: ${dotSize}px; height: ${dotSize}px;"></span>
          <div>
            <div class="planet-name">${planet.name}</div>
            <div class="planet-type">${planet.type}</div>
          </div>
        </div>
        <div class="compare-card-grid">
          <div class="compare-card-stat"><div class="label">${t('compare.diameter')}</div><div class="value">${planet.diameter}</div></div>
          <div class="compare-card-stat"><div class="label">${t('compare.mass')}</div><div class="value">${planet.mass}</div></div>
          <div class="compare-card-stat"><div class="label">${t('compare.gravity')}</div><div class="value">${planet.gravity}</div></div>
          <div class="compare-card-stat"><div class="label">${t('compare.day')}</div><div class="value">${planet.dayLength}</div></div>
          <div class="compare-card-stat"><div class="label">${t('compare.year')}</div><div class="value">${planet.year}</div></div>
          <div class="compare-card-stat"><div class="label">${t('compare.moons')}</div><div class="value">${planet.moons > 0 ? planet.moons + ' ' + t('compare.known') : '0'}</div></div>
          <div class="compare-card-stat"><div class="label">${t('compare.temp')}</div><div class="value">${planet.temperature}</div></div>
          <div class="compare-card-stat"><div class="label">${t('compare.distance')}</div><div class="value">${planet.distance}</div></div>
        </div>
      </div>`;
  }

  html += '</div>';

  // Size comparison bar
  html += renderSizeBar(data, maxR);

  return html;
}

function renderSizeBar(data, maxR) {
  let html = '<div class="compare-size-bar">';
  for (const planet of data) {
    const hex = colorToHex(planet.color);
    const widthPct = Math.max(2, (planet.displayRadius / maxR) * 100);
    html += `
      <div class="compare-size-item">
        <div class="compare-size-fill" style="width: ${widthPct}%; background: ${hex};" title="${planet.name}"></div>
        <span class="compare-size-label">${planet.name}</span>
      </div>`;
  }
  html += '</div>';
  return html;
}
