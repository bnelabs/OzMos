/**
 * Keplerian orbital mechanics for computing real planet positions at any date.
 * Uses NASA JPL approximate orbital elements for J2000.0 epoch.
 */
import * as THREE from 'three';
import { SOLAR_SYSTEM } from '../data/solarSystem.js';
import { DWARF_PLANETS } from '../data/dwarfPlanets.js';
import { ASTEROIDS } from '../data/asteroids.js';
import { MISSIONS } from '../data/missions.js';

// ==================== Constants ====================

const DEG_TO_RAD = Math.PI / 180;
const J2000_JD = 2451545.0; // Jan 1.5, 2000

/**
 * J2000.0 Keplerian orbital elements + century rates.
 * Source: NASA JPL "Approximate Positions of the Planets"
 * [a (AU), e, I (deg), L (deg), longPeri (deg), longNode (deg)]
 * Rates are per Julian century.
 */
const ELEMENTS = {
  mercury: {
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    I: [7.00497902, -0.00594749],
    L: [252.25032350, 149472.67411175],
    longPeri: [77.45779628, 0.16047689],
    longNode: [48.33076593, -0.12534081],
  },
  venus: {
    a: [0.72333566, 0.00000390],
    e: [0.00677672, -0.00004107],
    I: [3.39467605, -0.00078890],
    L: [181.97909950, 58517.81538729],
    longPeri: [131.60246718, 0.00268329],
    longNode: [76.67984255, -0.27769418],
  },
  earth: {
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    longPeri: [102.93768193, 0.32327364],
    longNode: [0.0, 0.0],
  },
  mars: {
    a: [1.52371034, 0.00001847],
    e: [0.09339410, 0.00007882],
    I: [1.84969142, -0.00813131],
    L: [355.44656895, 19140.30268499],  // corrected: was -4.55343205
    longPeri: [336.05637041, 0.44441088],  // corrected: was -23.94362959
    longNode: [49.55953891, -0.29257343],
  },
  jupiter: {
    a: [5.20288700, -0.00011607],
    e: [0.04838624, -0.00013253],
    I: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775],
    longPeri: [14.72847983, 0.21252668],
    longNode: [100.47390909, 0.20469106],
  },
  saturn: {
    a: [9.53667594, -0.00125060],
    e: [0.05386179, -0.00050991],
    I: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201],
    longPeri: [92.59887831, -0.41897216],
    longNode: [113.66242448, -0.28867794],
  },
  uranus: {
    a: [19.18916464, -0.00196176],
    e: [0.04725744, -0.00004397],
    I: [0.77263783, -0.00242939],
    L: [313.23810451, 428.48202785],
    longPeri: [170.95427630, 0.40805281],
    longNode: [74.01692503, 0.04240589],
  },
  neptune: {
    a: [30.06992276, 0.00026291],
    e: [0.00859048, 0.00005105],
    I: [1.77004347, 0.00035372],
    L: [304.87997031, 218.45945325],  // corrected: was -55.12002969
    longPeri: [44.96476227, -0.32241464],
    longNode: [131.78422574, -0.00508664],
  },
  // Dwarf planets — NASA JPL approximate elements
  ceres: {
    a: [2.7691652, 0.0],
    e: [0.0760090, 0.0],
    I: [10.59407, 0.0],
    L: [153.94, 78051.33],
    longPeri: [73.5968, 0.0],
    longNode: [80.3293, 0.0],
  },
  pluto: {
    a: [39.48211675, -0.00031596],
    e: [0.24882730, 0.00005170],
    I: [17.14001206, 0.00004818],
    L: [238.92903833, 145.20780515],
    longPeri: [224.06891629, -0.04062942],
    longNode: [110.30393684, -0.01183482],
  },
  haumea: {
    a: [43.218, 0.0],
    e: [0.1912, 0.0],
    I: [28.19, 0.0],
    L: [210.0, 122.56],
    longPeri: [239.0, 0.0],
    longNode: [122.17, 0.0],
  },
  makemake: {
    a: [45.792, 0.0],
    e: [0.1559, 0.0],
    I: [29.01, 0.0],
    L: [85.0, 112.49],
    longPeri: [297.0, 0.0],
    longNode: [79.38, 0.0],
  },
  eris: {
    a: [67.781, 0.0],
    e: [0.4407, 0.0],
    I: [44.04, 0.0],
    L: [204.0, 55.53],
    longPeri: [151.0, 0.0],
    longNode: [35.87, 0.0],
  },
  // Notable asteroids — NASA JPL approximate elements
  vesta: {
    a: [2.3615, 0.0],
    e: [0.0887, 0.0],
    I: [7.1422, 0.0],
    L: [20.86, 99154.17],
    longPeri: [149.85, 0.0],
    longNode: [103.85, 0.0],
  },
  pallas: {
    a: [2.7716, 0.0],
    e: [0.2313, 0.0],
    I: [34.832, 0.0],
    L: [198.0, 78039.42],
    longPeri: [310.04, 0.0],
    longNode: [173.09, 0.0],
  },
  hygiea: {
    a: [3.1421, 0.0],
    e: [0.1146, 0.0],
    I: [3.8316, 0.0],
    L: [283.2, 64651.98],
    longPeri: [312.4, 0.0],
    longNode: [283.2, 0.0],
  },
  juno: {
    a: [2.6700, 0.0],
    e: [0.2562, 0.0],
    I: [12.982, 0.0],
    L: [248.2, 82084.76],
    longPeri: [247.84, 0.0],
    longNode: [169.91, 0.0],
  },
  eros: {
    a: [1.4580, 0.0],
    e: [0.2226, 0.0],
    I: [10.829, 0.0],
    L: [178.8, 130493.76],
    longPeri: [178.64, 0.0],
    longNode: [304.32, 0.0],
  },
};

// ==================== Date Utilities ====================

/**
 * Convert date string "YYYY-MM-DD" to Julian Day Number.
 */
export function dateToJulian(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let Y = y, M = m;
  if (M <= 2) { Y -= 1; M += 12; }
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + B - 1524.5;
}

/**
 * Julian Day to Julian centuries since J2000.0.
 */
function julianToT(jd) {
  return (jd - J2000_JD) / 36525.0;
}

/**
 * Get current date as "YYYY-MM-DD" string.
 */
export function getCurrentDateStr() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

/**
 * Convert Julian Day Number to "YYYY-MM-DD" string.
 */
export function julianToDateStr(jd) {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let A;
  if (z < 2299161) {
    A = z;
  } else {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    A = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + f;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const d2 = Math.floor(day);
  const m2 = String(month).padStart(2, '0');
  const d2s = String(d2).padStart(2, '0');
  return `${year}-${m2}-${d2s}`;
}

/**
 * Advance a date string by a number of days (fractional ok).
 */
export function advanceDateStr(dateStr, days) {
  const jd = dateToJulian(dateStr) + days;
  return julianToDateStr(jd);
}

// ==================== Kepler Solver ====================

/**
 * Solve Kepler's equation M = E - e*sin(E) via Newton-Raphson.
 * @param {number} M - Mean anomaly in radians
 * @param {number} e - Eccentricity
 * @returns {number} E - Eccentric anomaly in radians
 */
function solveKeplerEquation(M, e) {
  let E = M + e * Math.sin(M); // initial guess
  for (let i = 0; i < 15; i++) {
    const dE = (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

// ==================== Position Calculation ====================

/**
 * Get heliocentric position of a planet at a given date in AU.
 * Returns {x, y, z} in ecliptic coordinates.
 */
export function getPlanetHeliocentricAU(planetKey, dateStr) {
  const elem = ELEMENTS[planetKey];
  if (!elem) return { x: 0, y: 0, z: 0 };

  // Accept either a JD number (for smooth sub-day interpolation) or a date string
  const jd = typeof dateStr === 'number' ? dateStr : dateToJulian(dateStr);
  const T = julianToT(jd);

  // Compute current elements
  const a = elem.a[0] + elem.a[1] * T;
  const e = elem.e[0] + elem.e[1] * T;
  const I = (elem.I[0] + elem.I[1] * T) * DEG_TO_RAD;
  const L = (elem.L[0] + elem.L[1] * T) % 360;
  const longPeri = (elem.longPeri[0] + elem.longPeri[1] * T) % 360;
  const longNode = (elem.longNode[0] + elem.longNode[1] * T) * DEG_TO_RAD;

  // Argument of perihelion
  const omega = (longPeri - (elem.longNode[0] + elem.longNode[1] * T)) * DEG_TO_RAD;

  // Mean anomaly
  let M = (L - longPeri) * DEG_TO_RAD;
  // Normalize to [0, 2pi]
  M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  // Solve Kepler's equation
  const E = solveKeplerEquation(M, e);

  // True anomaly
  const sinV = Math.sqrt(1 - e * e) * Math.sin(E) / (1 - e * Math.cos(E));
  const cosV = (Math.cos(E) - e) / (1 - e * Math.cos(E));
  const v = Math.atan2(sinV, cosV);

  // Heliocentric distance
  const r = a * (1 - e * Math.cos(E));

  // Position in orbital plane
  const xOrbit = r * Math.cos(v);
  const yOrbit = r * Math.sin(v);

  // Rotate to ecliptic coordinates
  const cosOmega = Math.cos(omega);
  const sinOmega = Math.sin(omega);
  const cosNode = Math.cos(longNode);
  const sinNode = Math.sin(longNode);
  const cosI = Math.cos(I);
  const sinI = Math.sin(I);

  const x = (cosOmega * cosNode - sinOmega * sinNode * cosI) * xOrbit +
            (-sinOmega * cosNode - cosOmega * sinNode * cosI) * yOrbit;
  const y = (cosOmega * sinNode + sinOmega * cosNode * cosI) * xOrbit +
            (-sinOmega * sinNode + cosOmega * cosNode * cosI) * yOrbit;
  const z = (sinOmega * sinI) * xOrbit + (cosOmega * sinI) * yOrbit;

  return { x, y, z };
}

// ==================== Scene Coordinate Mapping ====================

/**
 * Map from real AU coordinates to display scene coordinates.
 * Uses ratio of display orbit radius to real semi-major axis.
 */
function auToScene(planetKey, posAU) {
  // Check SOLAR_SYSTEM, DWARF_PLANETS, and ASTEROIDS for data
  const data = SOLAR_SYSTEM[planetKey] || DWARF_PLANETS[planetKey] || ASTEROIDS[planetKey];
  if (!data || !data.orbitRadius) return new THREE.Vector3(posAU.x * 36, posAU.z * 0.5, posAU.y * 36);

  const elem = ELEMENTS[planetKey];
  if (!elem) return new THREE.Vector3(posAU.x * 36, posAU.z * 0.5, posAU.y * 36);

  const realA = elem.a[0]; // semi-major axis in AU
  const scale = data.orbitRadius / realA;

  // Map ecliptic (x, y) to scene (x, z), with z-height from inclination
  return new THREE.Vector3(
    posAU.x * scale,
    posAU.z * scale * 0.5, // reduce vertical exaggeration
    posAU.y * scale
  );
}

/**
 * Get planet position in scene coordinates for a given date.
 */
export function getPlanetPosition(planetKey, dateStr) {
  if (planetKey === 'sun') return new THREE.Vector3(0, 0, 0);

  const posAU = getPlanetHeliocentricAU(planetKey, dateStr);
  return auToScene(planetKey, posAU);
}

// ==================== Mission Trajectory ====================

/**
 * Interpolate date between two date strings.
 * @param {string} startDate - "YYYY-MM-DD"
 * @param {string} endDate - "YYYY-MM-DD"
 * @param {number} t - 0..1
 * @returns {string} interpolated date
 */
function interpolateDate(startDate, endDate, t) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const interp = new Date(start + (end - start) * t);
  return interp.toISOString().split('T')[0];
}

/**
 * Generate a smooth trajectory for a mission with real orbital positions.
 * @param {string} missionId
 * @returns {{ points: THREE.Vector3[], waypointIndices: number[], dates: string[], waypointDates: string[] }}
 */
export function getMissionTrajectory(missionId) {
  const mission = MISSIONS.find(m => m.id === missionId);
  if (!mission) return { points: [], waypointIndices: [], dates: [], waypointDates: [] };

  const waypoints = mission.waypoints;
  const allPoints = [];
  const allDates = [];
  const waypointIndices = [];
  const waypointDates = [];

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];

    // Get position for this waypoint
    let pos;
    if (wp.body && ELEMENTS[wp.body]) {
      pos = getPlanetPosition(wp.body, wp.date);
    } else if (wp.body === 'earth' || wp.body === 'sun') {
      pos = getPlanetPosition(wp.body, wp.date);
    } else if (wp.distance) {
      // For interstellar / Pluto: extrapolate outward from last known body
      const prevWp = waypoints[i - 1];
      let prevPos = new THREE.Vector3(0, 0, 0);
      if (prevWp && prevWp.body && ELEMENTS[prevWp.body]) {
        prevPos = getPlanetPosition(prevWp.body, prevWp.date);
      }
      // Extend outward in same general direction
      const dir = prevPos.clone().normalize();
      if (dir.length() < 0.01) dir.set(1, 0, 0);
      const scaledDist = Math.min(wp.distance, 160); // cap for display
      pos = dir.multiplyScalar(scaledDist);
    } else {
      pos = new THREE.Vector3(0, 0, 0);
    }

    waypointIndices.push(allPoints.length);
    waypointDates.push(wp.date);
    allPoints.push(pos);
    allDates.push(wp.date);

    // Generate intermediate points between waypoints
    if (i < waypoints.length - 1) {
      const nextWp = waypoints[i + 1];
      const steps = 20; // intermediate points per segment
      for (let s = 1; s <= steps; s++) {
        const t = s / (steps + 1);
        const interpDate = interpolateDate(wp.date, nextWp.date, t);

        // For the spacecraft, interpolate position between waypoint bodies
        let nextPos;
        if (nextWp.body && ELEMENTS[nextWp.body]) {
          nextPos = getPlanetPosition(nextWp.body, nextWp.date);
        } else if (nextWp.distance) {
          const dir2 = pos.clone().normalize();
          if (dir2.length() < 0.01) dir2.set(1, 0, 0);
          nextPos = dir2.multiplyScalar(Math.min(nextWp.distance, 160));
        } else {
          nextPos = new THREE.Vector3(0, 0, 0);
        }

        // Smooth interpolation with slight curvature
        const interp = new THREE.Vector3().lerpVectors(pos, nextPos, t);
        // Add slight orbital curvature - spacecraft doesn't travel straight lines
        const perpendicular = new THREE.Vector3(-interp.z, 0, interp.x).normalize();
        const curvature = Math.sin(t * Math.PI) * pos.distanceTo(nextPos) * 0.08;
        interp.add(perpendicular.multiplyScalar(curvature));

        allPoints.push(interp);
        allDates.push(interpDate);
      }
    }
  }

  return { points: allPoints, waypointIndices, dates: allDates, waypointDates };
}

/**
 * Get date for a given progress along a mission trajectory.
 */
export function getMissionDateAtProgress(missionId, progress) {
  const mission = MISSIONS.find(m => m.id === missionId);
  if (!mission || mission.waypoints.length < 2) return '';

  const startDate = new Date(mission.waypoints[0].date).getTime();
  const endDate = new Date(mission.waypoints[mission.waypoints.length - 1].date).getTime();
  const currentDate = new Date(startDate + (endDate - startDate) * progress);
  return currentDate.toISOString().split('T')[0];
}

/**
 * Get waypoint progress positions (0..1) for timeline dots.
 */
export function getWaypointProgressPositions(missionId) {
  const mission = MISSIONS.find(m => m.id === missionId);
  if (!mission || mission.waypoints.length < 2) return [];

  const startTime = new Date(mission.waypoints[0].date).getTime();
  const endTime = new Date(mission.waypoints[mission.waypoints.length - 1].date).getTime();
  const totalDuration = endTime - startTime;

  return mission.waypoints.map(wp => {
    const wpTime = new Date(wp.date).getTime();
    return totalDuration > 0 ? (wpTime - startTime) / totalDuration : 0;
  });
}
