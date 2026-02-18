/**
 * Returns localized planet/moon data by merging the English base
 * with the current language's translations.
 */
import { SOLAR_SYSTEM, PLANET_ORDER } from '../data/solarSystem.js';
import { DWARF_PLANETS } from '../data/dwarfPlanets.js';
import { ASTEROIDS } from '../data/asteroids.js';
import { getLang, t } from './i18n.js';
import { dataTR } from './data.tr.js';

const TRANSLATIONS = { tr: dataTR };

/**
 * Get a localized copy of a planet's data.
 * Non-translated fields (numeric, color, etc.) pass through unchanged.
 */
export function getLocalizedPlanet(key) {
  const base = SOLAR_SYSTEM[key] || DWARF_PLANETS[key] || ASTEROIDS[key];
  if (!base) return null;

  const lang = getLang();
  if (lang === 'en') return base;

  const tr = TRANSLATIONS[lang]?.[key];
  if (!tr) return base;

  const result = { ...base };

  // Scalar string fields
  const scalarFields = [
    'name', 'type', 'subtitle', 'tagline', 'geology',
    'temperature', 'atmosphere', 'orbitalPeriod', 'dayLength',
    'distanceFromSun', 'gravity', 'mass', 'age', 'luminosity',
    'coreTemperature', 'spectralClass',
  ];
  for (const field of scalarFields) {
    if (tr[field] !== undefined) result[field] = tr[field];
  }

  // Array fields
  if (tr.description) result.description = tr.description;
  if (tr.funFacts) result.funFacts = tr.funFacts;
  if (tr.minerals) result.minerals = tr.minerals;

  // Deep merge object fields
  if (tr.physicalAttributes && base.physicalAttributes) {
    result.physicalAttributes = { ...base.physicalAttributes, ...tr.physicalAttributes };
  }
  if (tr.astrophysics && base.astrophysics) {
    result.astrophysics = { ...base.astrophysics, ...tr.astrophysics };
  }
  if (tr.composition && base.composition) {
    result.composition = { ...base.composition, ...tr.composition };
  }

  // Merge moon fields
  if (tr.moons && base.moons) {
    result.moons = base.moons.map((moon, i) => {
      const moonTr = tr.moons[i];
      if (!moonTr) return moon;
      const merged = { ...moon };
      if (moonTr.name) merged.name = moonTr.name;
      if (moonTr.description) merged.description = moonTr.description;
      if (moonTr.diameter) merged.diameter = moonTr.diameter;
      if (moonTr.orbitalPeriod) merged.orbitalPeriod = moonTr.orbitalPeriod;
      if (moonTr.minerals) merged.minerals = moonTr.minerals;
      return merged;
    });
  }

  return result;
}

/**
 * Get localized comparison data.
 */
export function getLocalizedComparisonData() {
  return PLANET_ORDER.filter(k => k !== 'sun').map(key => {
    const p = getLocalizedPlanet(key);
    const base = SOLAR_SYSTEM[key];
    return {
      key,
      name: p.name,
      type: p.type,
      diameter: p.physicalAttributes.diameter,
      mass: p.massEarths + ' ' + t('unit.earthMass'),
      gravity: p.gravity,
      dayLength: p.dayLength,
      year: p.orbitalPeriod,
      moons: p.moons.length,
      temperature: p.temperature,
      distance: p.distanceFromSun,
      color: base.color,
      displayRadius: base.displayRadius,
    };
  });
}
