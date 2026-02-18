/**
 * Generates HTML content for planet/moon info panels.
 */
import { getLocalizedPlanet } from '../i18n/localizedData.js';
import { t, getLang } from '../i18n/i18n.js';
import { PLANET_LAYERS } from '../data/planetLayers.js';
import { MINERAL_INFO, MINERAL_INFO_TR } from '../data/mineralInfo.js';

function getMineralTooltip(mineralName) {
  const lang = getLang();
  if (lang === 'tr' && MINERAL_INFO_TR[mineralName]) return MINERAL_INFO_TR[mineralName];
  // Try English lookup (works for both EN minerals and untranslated TR minerals)
  if (MINERAL_INFO[mineralName]) return MINERAL_INFO[mineralName];
  return '';
}

/**
 * Compact planet summary — shows only name, type, and 3-4 key stats.
 * Always visible, never covers more than ~40% of screen.
 */
export function renderCompactPlanetInfo(key) {
  const data = getLocalizedPlanet(key);
  if (!data) return '';

  let stats = '';
  if (key === 'sun') {
    stats += compactStat(t('stat.surfaceTemp'), data.temperature);
    stats += compactStat(t('stat.mass'), data.mass);
    stats += compactStat(t('stat.age'), data.age);
    stats += compactStat(t('stat.luminosity'), data.luminosity);
  } else {
    stats += compactStat(t('stat.mass'), `${data.massEarths} ${t('unit.earthMass')}`);
    stats += compactStat(t('stat.temperature'), data.temperature);
    stats += compactStat(t('stat.distance'), data.distanceFromSun);
    stats += compactStat(t('stat.gravity'), data.gravity);
  }

  let cutawayBtn = '';
  if (PLANET_LAYERS[key]) {
    cutawayBtn = `<button class="cutaway-toggle compact-cutaway" id="cutaway-btn" data-planet="${key}">
      ${t('cutaway.show')}
    </button>
    <div id="cutaway-container" style="display:none;"></div>`;
  }

  return `
    <div class="info-compact">
      <div class="info-compact-header">
        <h1>${data.name}</h1>
        <span class="subtitle">${data.type}</span>
      </div>
      <div class="info-compact-stats">${stats}</div>
      ${cutawayBtn}
      <button class="info-toggle-btn" id="info-show-more">${t('info.showMore') || 'Show more'} &#x25BC;</button>
    </div>`;
}

function compactStat(label, value) {
  return `
    <div class="info-compact-stat">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </div>`;
}

export function renderPlanetInfo(key) {
  const data = getLocalizedPlanet(key);
  if (!data) return '';

  let html = '';

  // Header
  html += `
    <div class="info-header fade-in">
      <div class="subtitle">${data.type}</div>
      <h1>${data.name}</h1>
      <div class="subtitle">${data.subtitle}</div>
    </div>
  `;

  // Tagline
  html += `<p class="info-tagline fade-in">${data.tagline}</p>`;

  // Quick Stats
  html += `<div class="info-section fade-in">
    <h3>${t('info.quickFacts')}</h3>
    <div class="info-grid">`;

  if (key === 'sun') {
    html += stat(t('stat.mass'), data.mass);
    html += stat(t('stat.surfaceTemp'), data.temperature);
    html += stat(t('stat.coreTemp'), data.coreTemperature);
    html += stat(t('stat.luminosity'), data.luminosity);
    html += stat(t('stat.age'), data.age);
    html += stat(t('stat.spectralClass'), data.spectralClass);
  } else {
    html += stat(t('stat.mass'), `${data.massEarths} <span class="unit">${t('unit.earthMass')}</span>`);
    html += stat(t('stat.gravity'), data.gravity);
    html += stat(t('stat.temperature'), data.temperature);
    html += stat(t('stat.dayLength'), data.dayLength);
    html += stat(t('stat.year'), data.orbitalPeriod);
    html += stat(t('stat.distance'), data.distanceFromSun);
  }

  html += `</div></div>`;

  // Physical Attributes
  if (data.physicalAttributes) {
    html += `<div class="info-section fade-in">
      <h3>${t('info.physicalAttributes')}</h3>
      <div class="info-grid">`;
    for (const [label, value] of Object.entries(data.physicalAttributes)) {
      html += stat(t('attr.' + label), value);
    }
    html += `</div></div>`;
  }

  // Atmosphere
  if (data.atmosphere) {
    html += `<div class="info-section fade-in">
      <h3>${t('info.atmosphere')}</h3>
      <div class="info-grid">
        ${stat(t('info.atmosphere'), data.atmosphere, true)}
      </div>
    </div>`;
  }

  // Composition (Sun)
  if (data.composition) {
    html += `<div class="info-section fade-in">
      <h3>${t('info.composition')}</h3>
      <div class="info-grid">`;
    for (const [element, percentage] of Object.entries(data.composition)) {
      html += stat(t('attr.' + element), percentage);
    }
    html += `</div></div>`;
  }

  // Minerals
  if (data.minerals && data.minerals.length > 0) {
    html += `<div class="info-section fade-in">
      <h3>${t('info.minerals')}</h3>
      <div class="mineral-tags">`;
    for (const mineral of data.minerals) {
      const tip = getMineralTooltip(mineral);
      html += tip
        ? `<span class="mineral-tag" title="${tip.replace(/"/g, '&quot;')}">${mineral}</span>`
        : `<span class="mineral-tag">${mineral}</span>`;
    }
    html += `</div></div>`;
  }

  // Astrophysics
  if (data.astrophysics) {
    html += `<div class="info-section fade-in">
      <h3>${t('info.astrophysics')}</h3>
      <div class="info-grid">`;
    for (const [label, value] of Object.entries(data.astrophysics)) {
      html += stat(t('attr.' + label), value);
    }
    html += `</div></div>`;
  }

  // Geology
  if (data.geology) {
    html += `<div class="info-section fade-in">
      <h3>${t('info.geology')}</h3>
      <div class="info-description"><p>${data.geology}</p></div>
    </div>`;
  }

  // Internal structure cutaway (3D renderer)
  html += `<div class="info-section fade-in">
    <button class="cutaway-toggle" id="cutaway-btn" data-planet="${key}">
      ${t('cutaway.show')}
    </button>
    <div id="cutaway-container" style="display:none;"></div>
  </div>`;

  // Description
  if (data.description) {
    html += `<div class="info-section fade-in">
      <h3>${t('info.about')}</h3>
      <div class="info-description">`;
    for (const para of data.description) {
      html += `<p>${para}</p>`;
    }
    html += `</div></div>`;
  }

  // Fun Facts
  if (data.funFacts && data.funFacts.length > 0) {
    html += `<div class="info-section fade-in">
      <h3>${t('info.funFacts')}</h3>
      <div class="info-description">`;
    for (const fact of data.funFacts) {
      html += `<p>&#x2022; ${fact}</p>`;
    }
    html += `</div></div>`;
  }

  // Moons
  if (data.moons && data.moons.length > 0) {
    html += `<div class="info-section fade-in">
      <h3>${t('info.moons')} (${data.moons.length})</h3>
      <div class="moon-list">`;
    for (let i = 0; i < data.moons.length; i++) {
      const moon = data.moons[i];
      html += `
        <div class="moon-item" data-planet="${key}" data-moon-index="${i}">
          <div class="moon-dot" style="background: ${moon.color};"></div>
          <span class="moon-name">${moon.name}</span>
          <span class="moon-info">${moon.diameter}</span>
        </div>`;
    }
    html += `</div></div>`;
  }

  return html;
}

export function renderMoonInfo(planetKey, moonIndex) {
  const planet = getLocalizedPlanet(planetKey);
  if (!planet || !planet.moons[moonIndex]) return '';

  const moon = planet.moons[moonIndex];
  let html = '';

  html += `
    <div class="info-header fade-in">
      <div class="subtitle">${t('moon.of')} ${planet.name}</div>
      <h1>${moon.name}</h1>
    </div>
  `;

  html += `<div class="info-section fade-in">
    <h3>${t('info.quickFacts')}</h3>
    <div class="info-grid">
      ${stat(t('stat.diameter'), moon.diameter)}
      ${stat(t('stat.orbitalPeriod'), moon.orbitalPeriod)}
    </div>
  </div>`;

  html += `<div class="info-section fade-in">
    <h3>${t('moon.description')}</h3>
    <div class="info-description"><p>${moon.description}</p></div>
  </div>`;

  if (moon.minerals && moon.minerals.length > 0) {
    html += `<div class="info-section fade-in">
      <h3>${t('moon.keyMinerals')}</h3>
      <div class="mineral-tags">`;
    for (const mineral of moon.minerals) {
      const tip = getMineralTooltip(mineral);
      html += tip
        ? `<span class="mineral-tag" title="${tip.replace(/"/g, '&quot;')}">${mineral}</span>`
        : `<span class="mineral-tag">${mineral}</span>`;
    }
    html += `</div></div>`;
  }

  // Cross-section for moons with layer data
  const moonLayerKey = `${planetKey}_moon_${moonIndex}`;
  if (PLANET_LAYERS[moonLayerKey]) {
    html += `<div class="info-section fade-in">
      <button class="cutaway-toggle" id="cutaway-btn" data-planet="${moonLayerKey}">
        ${t('cutaway.show')}
      </button>
      <div id="cutaway-container" style="display:none;"></div>
    </div>`;
  }

  // Moon prev/next navigation
  const moonCount = planet.moons.length;
  if (moonCount > 1) {
    const prevName = moonIndex > 0 ? planet.moons[moonIndex - 1].name : null;
    const nextName = moonIndex < moonCount - 1 ? planet.moons[moonIndex + 1].name : null;
    html += `
      <div class="info-section">
        <div class="moon-nav">
          <button class="nav-btn" id="moon-prev" ${!prevName ? 'disabled' : ''}>
            &larr; ${prevName || t('moon.prev')}
          </button>
          <button class="nav-btn" id="moon-next" ${!nextName ? 'disabled' : ''}>
            ${nextName || t('moon.next')} &rarr;
          </button>
        </div>
      </div>`;
  }

  // Back button
  html += `
    <div class="info-section">
      <button class="nav-btn" id="back-to-planet" data-planet="${planetKey}"
        style="width: 100%; text-align: center; padding: 10px;">
        &larr; ${t('moon.backTo')} ${planet.name}
      </button>
    </div>`;

  return html;
}

function stat(label, value, fullWidth = false) {
  return `
    <div class="info-stat${fullWidth ? ' full-width' : ''}">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </div>`;
}

