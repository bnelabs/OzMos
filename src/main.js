/**
 * OzMos — Solar System Explorer
 * Main entry point: wires the 3D scene to the UI.
 */
import { SolarSystemScene } from './scene/SolarSystemScene.js';
import { renderPlanetInfo, renderCompactPlanetInfo, renderMoonInfo } from './ui/InfoPanel.js';
import { renderCompareTable, renderCompareCards } from './ui/ComparePanel.js';
import { renderMissionList, renderMissionDetail, renderMissionHUD, renderWaypointCard } from './ui/MissionPanel.js';
import { MissionRenderer } from './scene/MissionRenderer.js';
import { CutawayRenderer } from './ui/CutawayRenderer.js';
import { SolarStormSimulation } from './scene/SolarStormSimulation.js';
import { audioManager } from './audio/AudioManager.js';
import { CinematicTour } from './scene/CinematicTour.js';
import { PLANET_ORDER, SOLAR_SYSTEM } from './data/solarSystem.js';
import { DWARF_PLANETS, DWARF_PLANET_ORDER } from './data/dwarfPlanets.js';
import { MISSIONS } from './data/missions.js';
import { startOnboarding } from './ui/Onboarding.js';
import { renderQuizMenu, renderQuizQuestion, renderQuizResult, renderQuizSummary } from './ui/QuizPanel.js';
import { filterQuestions } from './data/quizQuestions.js';
import { initLang, setLang, getLang, t, onLangChange } from './i18n/i18n.js';
import { getLocalizedPlanet } from './i18n/localizedData.js';

// ==================== DOM Elements ====================
const dedicationScreen = document.getElementById('dedication-screen');
const dedicationSkip = document.getElementById('dedication-skip');
const langPicker = document.getElementById('lang-picker');
const canvasContainer = document.getElementById('canvas-container');
const loadingScreen = document.getElementById('loading-screen');
const loadProgress = document.getElementById('load-progress');
const infoPanel = document.getElementById('info-panel');
const infoContent = document.getElementById('info-content');
const infoClose = document.getElementById('info-close');
const comparePanel = document.getElementById('compare-panel');
const compareContent = document.getElementById('compare-content');
const compareClose = document.getElementById('compare-close');
const tooltip = document.getElementById('tooltip');

const btnOverview = document.getElementById('btn-overview');
const btnCompare = document.getElementById('btn-compare');
const btnMissions = document.getElementById('btn-missions');
const btnSpeed = document.getElementById('btn-speed');
const btnOrbits = document.getElementById('btn-orbits');
const btnLabels = document.getElementById('btn-labels');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnMusic = document.getElementById('btn-music');
const musicIcon = document.getElementById('music-icon');
const speedLabel = document.getElementById('speed-label');

const missionPanel = document.getElementById('mission-panel');
const missionContent = document.getElementById('mission-content');
const missionClose = document.getElementById('mission-close');

const quizPanel = document.getElementById('quiz-panel');
const quizContent = document.getElementById('quiz-content');
const quizClose = document.getElementById('quiz-close');
const btnQuiz = document.getElementById('btn-quiz');

const btnTour = document.getElementById('btn-tour');
const btnStorm = document.getElementById('btn-storm');
const musicPanel = document.getElementById('music-panel');
const musicVolumeSlider = document.getElementById('music-volume-slider');
const musicAutoSwitch = document.getElementById('music-auto-switch');
const navHamburger = document.getElementById('nav-hamburger');
const navControls = document.getElementById('nav-controls');
const infoDragHandle = document.getElementById('info-drag-handle');

const planetBar = document.getElementById('planet-bar');
const planetThumbs = document.querySelectorAll('.planet-thumb');

// ==================== State ====================
let scene;
let missionRenderer = null;
let cinematicTour = null;
let currentPlanetKey = null;
let currentMoonIndex = null;
let currentMissionId = null;
let missionModeActive = false;
let missionSpeedIndex = 0; // 0=1x, 1=2x, 2=5x, 3=10x
const missionSpeeds = [1, 2, 5, 10];
let speedIndex = 2; // default 1x
const speeds = [0, 0.25, 1, 3, 10];
const speedKeys = ['speed.paused', 'speed.025x', 'speed.1x', 'speed.3x', 'speed.10x'];
let labelsVisible = true;
let keyboardHelpVisible = false;
let waypointCardTimeout = null;
let activeCutaway = null;
let solarStorm = null;

// Quiz state
let quizActive = false;
let quizQuestions = [];
let quizCurrentIndex = 0;
let quizResults = [];
let quizStartTime = 0;
let quizSelectedCategory = null;

// Label elements (created dynamically)
const labelElements = {};

// ==================== Language Switcher ====================

function initLanguageSwitcher() {
  const langBtns = document.querySelectorAll('.lang-btn');
  // Set initial active state
  langBtns.forEach(btn => {
    const isActive = btn.dataset.lang === getLang();
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang);
    });
  });
}

function updateLangButtons() {
  const langBtns = document.querySelectorAll('.lang-btn');
  langBtns.forEach(btn => {
    const isActive = btn.dataset.lang === getLang();
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

// ==================== Refresh UI on language change ====================

function refreshStaticText() {
  // Update all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });

  // Update speed label
  const speedDisplay = t(speedKeys[speedIndex]);
  speedLabel.textContent = speedDisplay;
  btnSpeed.setAttribute('aria-label', t('aria.speed') + ': ' + speedDisplay);

  // Update nav button aria-labels
  btnOverview.setAttribute('aria-label', t('aria.overview'));
  btnOverview.setAttribute('title', t('aria.overview'));
  btnCompare.setAttribute('aria-label', t('aria.compare'));
  btnCompare.setAttribute('title', t('aria.compare'));
  btnOrbits.setAttribute('aria-label', t('aria.orbits'));
  btnOrbits.setAttribute('title', t('aria.orbits'));
  btnLabels.setAttribute('aria-label', t('aria.labels'));
  btnLabels.setAttribute('title', t('aria.labels'));
  btnFullscreen.setAttribute('aria-label', t('aria.fullscreen'));
  if (btnMusic) btnMusic.setAttribute('aria-label', t('aria.music'));
  if (btnTour) {
    btnTour.setAttribute('aria-label', t('aria.tour'));
    btnTour.setAttribute('title', t('aria.tour'));
  }
  if (btnQuiz) {
    btnQuiz.setAttribute('aria-label', t('aria.quiz'));
    btnQuiz.setAttribute('title', t('aria.quiz'));
  }
  infoClose.setAttribute('aria-label', t('aria.closeInfo'));
  compareClose.setAttribute('aria-label', t('aria.closeCompare'));
  if (missionClose) missionClose.setAttribute('aria-label', t('missions.close'));
  if (quizClose) quizClose.setAttribute('aria-label', t('aria.closeQuiz'));

  // Update planet bar button labels
  planetThumbs.forEach(thumb => {
    const key = thumb.dataset.planet;
    const data = getLocalizedPlanet(key);
    if (data) {
      thumb.querySelector('span').textContent = data.name;
      thumb.setAttribute('title', data.name);
      thumb.setAttribute('aria-label', t('planet.select') + ' ' + data.name);
    }
  });

  // Update planet labels in 3D scene
  for (const key of [...PLANET_ORDER, ...DWARF_PLANET_ORDER]) {
    const el = labelElements[key];
    if (el) {
      const data = getLocalizedPlanet(key);
      if (data) el.textContent = data.name;
    }
  }
}

function refreshOpenPanels() {
  // Re-render info panel if open
  if (currentPlanetKey && !infoPanel.classList.contains('hidden')) {
    if (currentMoonIndex !== null) {
      openMoonInfoPanel(currentPlanetKey, currentMoonIndex);
    } else if (infoPanel.classList.contains('expanded')) {
      // Re-render expanded view
      infoContent.innerHTML = renderPlanetInfo(currentPlanetKey);
      wireInfoPanelHandlers();
    } else {
      // Re-render compact view
      infoContent.innerHTML = renderCompactPlanetInfo(currentPlanetKey);
      wireCompactHandlers(currentPlanetKey);
    }
  }

  // Re-render compare panel if open
  if (!comparePanel.classList.contains('hidden')) {
    const isMobile = window.innerWidth <= 768;
    compareContent.innerHTML = isMobile ? renderCompareCards() : renderCompareTable();
  }

  // Re-render mission panel if open
  if (missionPanel && !missionPanel.classList.contains('hidden')) {
    if (currentMissionId) {
      missionContent.innerHTML = renderMissionDetail(currentMissionId);
      wireMissionDetailHandlers();
    } else {
      missionContent.innerHTML = renderMissionList();
      wireMissionListHandlers();
    }
  }

  // Re-render mission HUD if active
  if (missionModeActive && currentMissionId) {
    showMissionHUD(currentMissionId);
  }

  // Re-render quiz panel if open and showing menu
  if (quizPanel && !quizPanel.classList.contains('hidden') && !quizActive) {
    quizContent.innerHTML = renderQuizMenu();
    wireQuizMenuHandlers();
  }
}

function refreshUI() {
  updateLangButtons();
  refreshStaticText();
  if (!scene) return;
  refreshOpenPanels();
}

// Register language change handler
onLangChange(() => {
  refreshUI();
});

// ==================== Language Picker (First Visit) ====================

const LANG_STORAGE_KEY = 'ozmos-lang';

function showLangPicker() {
  langPicker.classList.remove('hidden');
  loadingScreen.classList.add('hidden');

  const pickerBtns = langPicker.querySelectorAll('.lang-picker-btn');
  pickerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      localStorage.setItem(LANG_STORAGE_KEY, lang);
      setLang(lang);
      langPicker.classList.add('fade-out');
      setTimeout(() => {
        langPicker.classList.add('hidden');
        langPicker.classList.remove('fade-out');
        startApp();
      }, 500);
    });
  });
}

function startApp() {
  // Now that language is set, initialize UI
  initLanguageSwitcher();
  refreshStaticText();

  // Show loading screen
  loadingScreen.classList.remove('hidden');
  loadingScreen.style.display = 'flex';

  const loadingTimeout = setTimeout(() => {
    if (!loadingComplete) {
      const loaderText = loadingScreen.querySelector('.loader-text');
      if (loaderText) {
        const msg = document.createElement('p');
        msg.className = 'loading-timeout';
        msg.textContent = t('loading.timeout');
        loaderText.appendChild(msg);
      }
    }
  }, 15000);

  function onProgress(percent) {
    if (loadProgress) {
      loadProgress.style.width = percent + '%';
    }
    if (percent >= 100) {
      loadingComplete = true;
      clearTimeout(loadingTimeout);
      // Initialize mission renderer and tour once scene is fully ready
      if (scene && scene.scene && !missionRenderer) {
        missionRenderer = new MissionRenderer(scene.scene);
      }
      if (scene && !cinematicTour) {
        cinematicTour = new CinematicTour(scene);
        cinematicTour.onPlanetVisit = (key) => {
          openInfoPanel(key);
        };
        cinematicTour.onTourEnd = () => {
          if (btnTour) btnTour.classList.remove('active');
          closeInfoPanel();
          audioManager.setContext('overview');
        };
      }
      setTimeout(() => {
        loadingScreen.classList.add('fade-out');
        setTimeout(() => {
          loadingScreen.style.display = 'none';
          startOnboarding();
          handleInitialHash();
        }, 800);
      }, 400);
    }
  }

  // Start 3D scene
  try {
    scene = new SolarSystemScene(canvasContainer, onProgress);
  } catch (err) {
    showError(t('error.webgl'));
    return;
  }

  // Listen for scene errors
  document.addEventListener('scene-error', (e) => {
    showError(e.detail || 'An error occurred while loading the 3D scene.');
  });

  // Wire scene callbacks
  wireSceneCallbacks();

  // Initialize audio (after user interaction via lang picker)
  // Force unmuted on first load so music auto-plays
  audioManager.init().then(() => {
    if (!audioManager.playing) {
      audioManager.play();
    }
    updateMusicIcon();
  });
  updateMusicIcon();
}

let loadingComplete = false;

// ==================== Error Handling ====================

function showError(message) {
  loadingScreen.innerHTML = `
    <div class="error-screen">
      <h2>${t('error.title')}</h2>
      <p>${message}</p>
      <button onclick="location.reload()">${t('error.reload')}</button>
    </div>
  `;
  loadingScreen.style.display = 'flex';
  loadingScreen.classList.remove('fade-out');
  loadingScreen.classList.remove('hidden');
}

// ==================== localStorage Migration (ozican- → ozmos-) ====================

(function migrateStorageKeys() {
  const migrations = [
    ['ozican-lang', 'ozmos-lang'],
    ['ozican-onboarding-done', 'ozmos-onboarding-done'],
    ['ozican-music-muted', 'ozmos-music-muted'],
    ['ozican-music-volume', 'ozmos-music-volume'],
    ['ozican-music-track', 'ozmos-music-track'],
    ['ozican-music-auto', 'ozmos-music-auto'],
  ];
  for (const [oldKey, newKey] of migrations) {
    const val = localStorage.getItem(oldKey);
    if (val !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, val);
    }
    if (val !== null) {
      localStorage.removeItem(oldKey);
    }
  }
})();

// ==================== Dedication Screen ====================

const DEDICATION_KEY = 'ozmos-dedication-seen';

let dedicationAudio = null;

function showDedication() {
  dedicationScreen.classList.remove('hidden');

  // Try to play dedication music (lightweight HTML5 audio, not AudioManager)
  try {
    dedicationAudio = new Audio('/audio/contemplative.mp3');
    dedicationAudio.loop = true;
    dedicationAudio.volume = 0;
    const playPromise = dedicationAudio.play();
    if (playPromise && playPromise.then) {
      playPromise.then(() => {
        // Fade volume from 0 to 0.5 over 2 seconds
        let vol = 0;
        const fadeIn = setInterval(() => {
          vol = Math.min(vol + 0.025, 0.5);
          if (dedicationAudio) dedicationAudio.volume = vol;
          if (vol >= 0.5) clearInterval(fadeIn);
        }, 100);
      }).catch(() => {
        // Autoplay blocked — start on first user interaction
        const startOnInteraction = () => {
          if (dedicationAudio) {
            dedicationAudio.play().catch(() => {});
            let vol = 0;
            const fadeIn = setInterval(() => {
              vol = Math.min(vol + 0.025, 0.5);
              if (dedicationAudio) dedicationAudio.volume = vol;
              if (vol >= 0.5) clearInterval(fadeIn);
            }, 100);
          }
          dedicationScreen.removeEventListener('click', startOnInteraction);
          dedicationScreen.removeEventListener('touchstart', startOnInteraction);
        };
        dedicationScreen.addEventListener('click', startOnInteraction, { once: true });
        dedicationScreen.addEventListener('touchstart', startOnInteraction, { once: true });
      });
    }
  } catch {
    // Audio not available — continue silently
  }

  // Auto-complete after poem animation (~12s)
  const autoTimer = setTimeout(endDedication, 12000);

  dedicationSkip.addEventListener('click', () => {
    clearTimeout(autoTimer);
    endDedication();
  });
}

function endDedication() {
  if (dedicationScreen.classList.contains('hidden')) return;

  // Fade out dedication audio
  if (dedicationAudio) {
    const fadeAudio = dedicationAudio;
    let vol = fadeAudio.volume;
    const fadeOut = setInterval(() => {
      vol = Math.max(vol - 0.05, 0);
      fadeAudio.volume = vol;
      if (vol <= 0) {
        clearInterval(fadeOut);
        fadeAudio.pause();
        fadeAudio.src = '';
      }
    }, 50);
    dedicationAudio = null;
  }

  dedicationScreen.classList.add('fade-out');
  localStorage.setItem(DEDICATION_KEY, '1');
  sessionStorage.setItem('ozmos-dedication-played', '1');
  setTimeout(() => {
    dedicationScreen.classList.add('hidden');
    dedicationScreen.classList.remove('fade-out');
    if (localStorage.getItem(LANG_STORAGE_KEY)) {
      initLang();
      startApp();
    } else {
      showLangPicker();
    }
  }, 1000);
}

// ==================== Boot ====================

// Boot — dedication takes priority
// Show dedication every session (not just first visit) to showcase the music and poem
if (!sessionStorage.getItem('ozmos-dedication-played')) {
  showDedication();
} else if (localStorage.getItem(LANG_STORAGE_KEY)) {
  initLang();
  startApp();
} else {
  showLangPicker();
}

// ==================== Planet Labels ====================

function createLabels() {
  for (const key of [...PLANET_ORDER, ...DWARF_PLANET_ORDER]) {
    const data = getLocalizedPlanet(key);
    if (!data) continue;
    const el = document.createElement('div');
    el.className = 'planet-label';
    el.textContent = data.name;
    el.dataset.planet = key;
    document.body.appendChild(el);
    labelElements[key] = el;
  }
}

function updateLabels() {
  if (!labelsVisible) {
    for (const el of Object.values(labelElements)) {
      el.style.opacity = '0';
    }
    return;
  }

  for (const key of [...PLANET_ORDER, ...DWARF_PLANET_ORDER]) {
    const el = labelElements[key];
    if (!el) continue;

    const pos = scene.getScreenPosition(key);
    if (pos.visible && pos.x > -100 && pos.x < window.innerWidth + 100 &&
        pos.y > -100 && pos.y < window.innerHeight + 100) {
      const pData = SOLAR_SYSTEM[key] || DWARF_PLANETS[key];
      const offset = (pData ? pData.displayRadius : 1) * 8 + 12;
      el.style.left = pos.x + 'px';
      el.style.top = (pos.y - offset) + 'px';
      el.style.transform = 'translateX(-50%)';
      el.style.opacity = '1';
    } else {
      el.style.opacity = '0';
    }
  }
}

// ==================== Scene Callbacks ====================

function wireSceneCallbacks() {
  createLabels();

  if (!scene) return;

  scene.onPlanetClick = (key) => {
    openInfoPanel(key);
  };

  scene.onMoonClick = (planetKey, moonIndex) => {
    if (scene.focusOnMoon) scene.focusOnMoon(planetKey, moonIndex);
    openMoonInfoPanel(planetKey, moonIndex);
  };

  scene.onHoverChange = (key) => {
    if (key) {
      tooltip.textContent = getLocalizedPlanet(key).name;
      tooltip.classList.remove('hidden');
    } else {
      tooltip.classList.add('hidden');
    }
  };

  scene.onFrame = (delta) => {
    updateLabels();

    // Update tooltip position
    if (scene.hoveredPlanet) {
      const pos = scene.getScreenPosition(scene.hoveredPlanet);
      tooltip.style.left = (pos.x + 15) + 'px';
      tooltip.style.top = (pos.y - 15) + 'px';
    }

    // Update mission trajectory animation
    if (missionRenderer) {
      missionRenderer.update(delta || 0.016);
    }

    // Update cinematic tour
    if (cinematicTour) {
      cinematicTour.update(delta || 0.016);
    }

    // Update solar storm simulation
    if (solarStorm && solarStorm.isActive) {
      solarStorm.update(delta || 0.016);
    }
  };
}

// ==================== Info Panel ====================

function disposeCutaway() {
  if (activeCutaway) {
    activeCutaway.dispose();
    activeCutaway = null;
  }
  const container = document.getElementById('cutaway-container');
  if (container) container.innerHTML = '';
}

/** Get the planet mesh and renderer for on-planet cutaway rendering */
function getPlanetMeshForCutaway(planetKey) {
  if (!scene) return { mesh: null, renderer: null };
  // Look up the actual 3D mesh in the scene
  const planet = scene.planets[planetKey] || scene.dwarfPlanets?.[planetKey];
  const mesh = planet ? planet.mesh : null;
  const renderer = scene.renderer || null;
  return { mesh, renderer };
}

function createCutawayForPlanet(container, planetKey) {
  const { mesh, renderer } = getPlanetMeshForCutaway(planetKey);
  if (mesh && renderer) {
    // On-planet mode: render cross-section on the actual 3D planet
    return new CutawayRenderer(container, planetKey, mesh, renderer);
  }
  // Fallback: legacy mini-renderer mode
  return new CutawayRenderer(container, planetKey);
}

function wireInfoPanelHandlers() {
  // Wire up moon click handlers inside panel
  const moonItems = infoContent.querySelectorAll('.moon-item');
  moonItems.forEach(item => {
    item.addEventListener('click', () => {
      const pKey = item.dataset.planet;
      const mIdx = parseInt(item.dataset.moonIndex, 10);
      openMoonInfoPanel(pKey, mIdx);
    });
  });

  // Wire up cutaway toggle (3D renderer)
  const cutawayBtn = document.getElementById('cutaway-btn');
  const cutawayContainer = document.getElementById('cutaway-container');
  if (cutawayBtn && cutawayContainer) {
    cutawayBtn.addEventListener('click', () => {
      const isHidden = cutawayContainer.style.display === 'none';
      if (isHidden) {
        disposeCutaway();
        activeCutaway = createCutawayForPlanet(cutawayContainer, cutawayBtn.dataset.planet);
        activeCutaway.init();
        cutawayContainer.style.display = '';
        cutawayBtn.textContent = t('cutaway.hide');
      } else {
        disposeCutaway();
        cutawayContainer.style.display = 'none';
        cutawayBtn.textContent = t('cutaway.show');
      }
    });
  }
}

function openInfoPanel(key) {
  disposeCutaway();
  currentPlanetKey = key;
  currentMoonIndex = null;

  // Show compact view first (visual-first: 3D scene stays dominant)
  infoContent.innerHTML = renderCompactPlanetInfo(key);
  infoPanel.classList.remove('hidden', 'expanded');
  infoPanel.setAttribute('aria-hidden', 'false');
  comparePanel.classList.add('hidden');
  comparePanel.setAttribute('aria-hidden', 'true');
  btnCompare.classList.remove('active');
  btnCompare.setAttribute('aria-pressed', 'false');
  if (quizPanel) {
    quizPanel.classList.add('hidden');
    quizPanel.setAttribute('aria-hidden', 'true');
    btnQuiz.classList.remove('active');
  }

  // Highlight active planet thumb
  planetThumbs.forEach(t => {
    t.classList.toggle('active', t.dataset.planet === key);
  });

  wireCompactHandlers(key);

  // Focus camera
  if (scene) scene.focusOnPlanet(key);

  // Context-aware music
  audioManager.setContext('planet');

  // URL deep linking
  history.replaceState(null, '', '#' + key);
}

function wireCompactHandlers(key) {
  const showMoreBtn = document.getElementById('info-show-more');
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => {
      expandInfoPanel(key);
    });
  }

  // Wire cutaway toggle in compact view
  const cutawayBtn = document.getElementById('cutaway-btn');
  const cutawayContainer = document.getElementById('cutaway-container');
  if (cutawayBtn && cutawayContainer) {
    cutawayBtn.addEventListener('click', () => {
      const isHidden = cutawayContainer.style.display === 'none';
      if (isHidden) {
        disposeCutaway();
        activeCutaway = createCutawayForPlanet(cutawayContainer, cutawayBtn.dataset.planet);
        activeCutaway.init();
        cutawayContainer.style.display = '';
        cutawayBtn.textContent = t('cutaway.hide');
      } else {
        disposeCutaway();
        cutawayContainer.style.display = 'none';
        cutawayBtn.textContent = t('cutaway.show');
      }
    });
  }
}

function expandInfoPanel(key) {
  infoContent.innerHTML = renderPlanetInfo(key);
  infoPanel.classList.add('expanded');
  wireInfoPanelHandlers();

  // Add "Show less" button at top of expanded content
  const showLessBtn = document.createElement('button');
  showLessBtn.className = 'info-toggle-btn';
  showLessBtn.id = 'info-show-less';
  showLessBtn.innerHTML = (t('info.showLess') || 'Show less') + ' &#x25B2;';
  showLessBtn.style.marginBottom = 'var(--space-3)';
  infoContent.prepend(showLessBtn);

  showLessBtn.addEventListener('click', () => {
    // Collapse back to compact
    disposeCutaway();
    infoContent.innerHTML = renderCompactPlanetInfo(key);
    infoPanel.classList.remove('expanded');
    wireCompactHandlers(key);
  });
}

function openMoonInfoPanel(planetKey, moonIndex) {
  currentMoonIndex = moonIndex;
  currentPlanetKey = planetKey;
  infoContent.innerHTML = renderMoonInfo(planetKey, moonIndex);
  infoPanel.classList.remove('hidden');
  infoPanel.setAttribute('aria-hidden', 'false');

  // Zoom camera to moon
  if (scene && scene.focusOnMoon) scene.focusOnMoon(planetKey, moonIndex);

  // Wire back button
  const backBtn = document.getElementById('back-to-planet');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      openInfoPanel(backBtn.dataset.planet);
    });
  }

  // Wire moon prev/next buttons
  const prevBtn = document.getElementById('moon-prev');
  const nextBtn = document.getElementById('moon-next');
  const planet = SOLAR_SYSTEM[planetKey] || DWARF_PLANETS[planetKey];
  const moonCount = planet && planet.moons ? planet.moons.length : 0;

  if (prevBtn && moonIndex > 0) {
    prevBtn.addEventListener('click', () => {
      openMoonInfoPanel(planetKey, moonIndex - 1);
    });
  } else if (prevBtn) {
    prevBtn.disabled = true;
    prevBtn.style.opacity = '0.3';
  }

  if (nextBtn && moonIndex < moonCount - 1) {
    nextBtn.addEventListener('click', () => {
      openMoonInfoPanel(planetKey, moonIndex + 1);
    });
  } else if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.style.opacity = '0.3';
  }

  // Wire cutaway toggle for moons with layer data
  const cutawayBtn = document.getElementById('cutaway-btn');
  const cutawayContainer = document.getElementById('cutaway-container');
  if (cutawayBtn && cutawayContainer) {
    cutawayBtn.addEventListener('click', () => {
      const isHidden = cutawayContainer.style.display === 'none';
      if (isHidden) {
        disposeCutaway();
        activeCutaway = createCutawayForPlanet(cutawayContainer, cutawayBtn.dataset.planet);
        activeCutaway.init();
        cutawayContainer.style.display = '';
        cutawayBtn.textContent = t('cutaway.hide');
      } else {
        disposeCutaway();
        cutawayContainer.style.display = 'none';
        cutawayBtn.textContent = t('cutaway.show');
      }
    });
  }
}

function closeInfoPanel() {
  disposeCutaway();
  infoPanel.classList.add('hidden');
  infoPanel.classList.remove('expanded');
  infoPanel.setAttribute('aria-hidden', 'true');
  currentPlanetKey = null;
  currentMoonIndex = null;
  planetThumbs.forEach(t => t.classList.remove('active'));

  // Clear URL hash
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

infoClose.addEventListener('click', closeInfoPanel);

// ==================== Planet Bar ====================

planetThumbs.forEach(thumb => {
  thumb.addEventListener('click', () => {
    if (thumb.closest('#dwarf-submenu')) return; // Handled by dwarf-specific handler
    const key = thumb.dataset.planet;
    if (!key) return;  // Skip toggle buttons without data-planet
    openInfoPanel(key);
  });
});

// ==================== Dwarf Planet Sub-Menu ====================

const dwarfToggle = document.getElementById('dwarf-toggle');
const dwarfSubmenu = document.getElementById('dwarf-submenu');

if (dwarfToggle && dwarfSubmenu) {
  dwarfToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dwarfSubmenu.classList.toggle('hidden');
    dwarfToggle.classList.toggle('active', !dwarfSubmenu.classList.contains('hidden'));
  });

  // Wire dwarf planet buttons
  dwarfSubmenu.querySelectorAll('.planet-thumb').forEach(thumb => {
    thumb.addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      const key = thumb.dataset.planet;
      openInfoPanel(key);
      dwarfSubmenu.classList.add('hidden');
      dwarfToggle.classList.remove('active');
    });
  });

  // Close submenu when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!dwarfSubmenu.classList.contains('hidden') &&
        !dwarfSubmenu.contains(e.target) &&
        e.target !== dwarfToggle && !dwarfToggle.contains(e.target)) {
      dwarfSubmenu.classList.add('hidden');
      dwarfToggle.classList.remove('active');
    }
  });
}

// ==================== Planet Bar Scroll Indicators ====================

function updateScrollIndicators() {
  if (!planetBar) return;
  const { scrollLeft, scrollWidth, clientWidth } = planetBar;
  planetBar.classList.toggle('scroll-left', scrollLeft > 5);
  planetBar.classList.toggle('scroll-right', scrollLeft < scrollWidth - clientWidth - 5);
}

planetBar.addEventListener('scroll', updateScrollIndicators, { passive: true });
window.addEventListener('resize', updateScrollIndicators);
// Initial check
setTimeout(updateScrollIndicators, 100);

// ==================== Navigation Buttons ====================

btnOverview.addEventListener('click', () => {
  if (scene) scene.goToOverview();
  closeInfoPanel();
  btnOverview.classList.add('active');
  audioManager.setContext('overview');
});

btnCompare.addEventListener('click', () => {
  const isHidden = comparePanel.classList.contains('hidden');
  if (isHidden) {
    const isMobile = window.innerWidth <= 768;
    compareContent.innerHTML = isMobile ? renderCompareCards() : renderCompareTable();
    comparePanel.classList.remove('hidden');
    comparePanel.setAttribute('aria-hidden', 'false');
    infoPanel.classList.add('hidden');
    infoPanel.setAttribute('aria-hidden', 'true');
    btnCompare.classList.add('active');
    btnCompare.setAttribute('aria-pressed', 'true');
  } else {
    comparePanel.classList.add('hidden');
    comparePanel.setAttribute('aria-hidden', 'true');
    btnCompare.classList.remove('active');
    btnCompare.setAttribute('aria-pressed', 'false');
  }
});

compareClose.addEventListener('click', () => {
  comparePanel.classList.add('hidden');
  comparePanel.setAttribute('aria-hidden', 'true');
  btnCompare.classList.remove('active');
  btnCompare.setAttribute('aria-pressed', 'false');
});

btnSpeed.addEventListener('click', () => {
  speedIndex = (speedIndex + 1) % speeds.length;
  if (scene) scene.setAnimationSpeed(speeds[speedIndex]);
  const speedDisplay = t(speedKeys[speedIndex]);
  speedLabel.textContent = speedDisplay;
  btnSpeed.setAttribute('aria-label', t('aria.speed') + ': ' + speedDisplay);
});

btnOrbits.addEventListener('click', () => {
  if (!scene) return;
  const visible = scene.toggleOrbits();
  btnOrbits.classList.toggle('active', visible);
  btnOrbits.setAttribute('aria-pressed', String(visible));
});

btnLabels.addEventListener('click', () => {
  if (!scene) return;
  labelsVisible = scene.toggleLabels();
  btnLabels.classList.toggle('active', labelsVisible);
  btnLabels.setAttribute('aria-pressed', String(labelsVisible));
});

btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// ==================== Hamburger Menu ====================

if (navHamburger && navControls) {
  navHamburger.addEventListener('click', () => {
    const isOpen = navControls.classList.toggle('open');
    navHamburger.classList.toggle('open', isOpen);
    navHamburger.setAttribute('aria-expanded', String(isOpen));
  });

  // Close menu when a nav button is clicked (mobile)
  navControls.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.innerWidth < 768) {
        navControls.classList.remove('open');
        navHamburger.classList.remove('open');
        navHamburger.setAttribute('aria-expanded', 'false');
      }
    });
  });
}

// ==================== Music Toggle & Panel ====================

function updateMusicIcon() {
  if (musicIcon) {
    musicIcon.innerHTML = audioManager.isMuted ? '&#128264;' : '&#128266;';
  }
  if (btnMusic) {
    btnMusic.classList.toggle('active', !audioManager.isMuted);
  }
}

function updateMusicTrackButtons() {
  const trackBtns = musicPanel ? musicPanel.querySelectorAll('.music-track') : [];
  const current = audioManager.getCurrentTrack();
  trackBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.track === current);
  });
}

if (btnMusic) {
  btnMusic.addEventListener('click', (e) => {
    // If music panel exists, toggle it on click; toggle mute on long press or if panel hidden
    if (musicPanel) {
      const isHidden = musicPanel.classList.contains('hidden');
      if (isHidden) {
        musicPanel.classList.remove('hidden');
        musicPanel.setAttribute('aria-hidden', 'false');
        // Ensure music is on when opening panel
        if (audioManager.isMuted) {
          audioManager.toggle();
          updateMusicIcon();
        }
        updateMusicTrackButtons();
        if (musicVolumeSlider) {
          musicVolumeSlider.value = Math.round(audioManager.getVolume() * 100);
        }
        if (musicAutoSwitch) {
          musicAutoSwitch.checked = audioManager.getAutoSwitch();
        }
      } else {
        musicPanel.classList.add('hidden');
        musicPanel.setAttribute('aria-hidden', 'true');
      }
    } else {
      audioManager.toggle();
      updateMusicIcon();
    }
  });
}

// Track selection buttons
if (musicPanel) {
  const trackBtns = musicPanel.querySelectorAll('.music-track');
  trackBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const trackId = btn.dataset.track;
      if (audioManager.isMuted) {
        audioManager.play();
        updateMusicIcon();
      }
      audioManager.crossfadeTo(trackId);
      updateMusicTrackButtons();
    });
  });
}

// Volume slider
if (musicVolumeSlider) {
  musicVolumeSlider.addEventListener('input', (e) => {
    audioManager.setVolume(parseInt(e.target.value, 10) / 100);
  });
}

// Auto-switch checkbox
if (musicAutoSwitch) {
  musicAutoSwitch.addEventListener('change', (e) => {
    audioManager.setAutoSwitch(e.target.checked);
  });
}

// Close music panel when clicking elsewhere
document.addEventListener('click', (e) => {
  if (musicPanel && !musicPanel.classList.contains('hidden')) {
    if (!musicPanel.contains(e.target) && e.target !== btnMusic && !btnMusic.contains(e.target)) {
      musicPanel.classList.add('hidden');
      musicPanel.setAttribute('aria-hidden', 'true');
    }
  }
});

// ==================== Mission Panel ====================

function openMissionPanel() {
  currentMissionId = null;
  missionContent.innerHTML = renderMissionList();
  missionPanel.classList.remove('hidden');
  missionPanel.setAttribute('aria-hidden', 'false');
  // Close other panels
  infoPanel.classList.add('hidden');
  infoPanel.setAttribute('aria-hidden', 'true');
  comparePanel.classList.add('hidden');
  comparePanel.setAttribute('aria-hidden', 'true');
  btnCompare.classList.remove('active');
  btnCompare.setAttribute('aria-pressed', 'false');
  btnMissions.classList.add('active');
  wireMissionListHandlers();
}

function closeMissionPanel() {
  missionPanel.classList.add('hidden');
  missionPanel.setAttribute('aria-hidden', 'true');
  btnMissions.classList.remove('active');
  currentMissionId = null;
  exitMissionMode();
}

function wireMissionListHandlers() {
  const cards = missionContent.querySelectorAll('.mission-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const missionId = card.dataset.missionId;
      enterMissionMode(missionId);
    });
  });
}

function wireMissionDetailHandlers() {
  const backBtn = document.getElementById('mission-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      exitMissionMode();
      currentMissionId = null;
      missionContent.innerHTML = renderMissionList();
      wireMissionListHandlers();
    });
  }
}

// ==================== Mission Mode ====================

function enterMissionMode(missionId) {
  currentMissionId = missionId;
  missionModeActive = true;

  // Close info panel
  infoPanel.classList.add('hidden');
  infoPanel.classList.remove('expanded');
  infoPanel.setAttribute('aria-hidden', 'true');

  // Close mission list panel — the HUD takes over
  missionPanel.classList.add('hidden');
  missionPanel.setAttribute('aria-hidden', 'true');

  // Enter mission mode on scene — freezes orbit animation
  if (scene) {
    scene.enterMissionMode();

    // Sync planets to launch date BEFORE drawing trajectory
    // so planets visually align with the trajectory start
    const mission = MISSIONS.find(m => m.id === missionId);
    if (mission) {
      scene.syncPlanetsToDate(mission.waypoints[0].date);
    }
  }

  // Show trajectory in 3D using real orbital mechanics
  if (missionRenderer && scene) {
    missionRenderer.showMission(missionId);
    missionRenderer.setCameraFollow(scene.camera, scene.controls);

    // Wire callbacks
    missionRenderer.onWaypointReached = (wpIdx, wp) => {
      showWaypointCard(missionId, wpIdx);
    };

    missionRenderer.onProgressUpdate = (progress, date, wpIdx) => {
      updateMissionHUD(progress, date);
      // Continuously sync planet positions to mission timeline
      if (scene && date) {
        scene.syncPlanetsToDate(date);
      }
    };

    missionRenderer.play();
  }

  // Show mission HUD overlay
  showMissionHUD(missionId);

  // Context-aware music: epic for missions
  audioManager.setContext('mission');
}

function exitMissionMode() {
  missionModeActive = false;

  // Clear trajectory
  if (missionRenderer) {
    missionRenderer.clearMission();
    missionRenderer.onWaypointReached = null;
    missionRenderer.onProgressUpdate = null;
  }

  // Remove HUD
  removeMissionHUD();
  removeWaypointCard();

  // Exit mission mode on scene — resumes normal orbit animation
  if (scene) {
    scene.exitMissionMode();
    if (!scene.selectedPlanet) {
      scene.controls.autoRotate = true;
      scene.controls.autoRotateSpeed = 0.3;
    }
  }

  // Restore music context based on current state
  audioManager.setContext(currentPlanetKey ? 'planet' : 'overview');
}

function showMissionHUD(missionId) {
  removeMissionHUD(); // Remove any existing HUD
  const hudHtml = renderMissionHUD(missionId);
  const container = document.createElement('div');
  container.id = 'mission-hud-container';
  container.innerHTML = hudHtml;
  document.body.appendChild(container);
  wireMissionHUDHandlers(missionId);
}

function removeMissionHUD() {
  const existing = document.getElementById('mission-hud-container');
  if (existing) existing.remove();
}

function updateMissionHUD(progress, date) {
  const fill = document.getElementById('timeline-fill');
  const playhead = document.getElementById('timeline-playhead');
  const dateLabel = document.getElementById('mission-hud-date');

  if (fill) fill.style.width = (progress * 100) + '%';
  if (playhead) playhead.style.left = (progress * 100) + '%';
  if (dateLabel && date) {
    const d = new Date(date);
    dateLabel.textContent = d.toLocaleDateString(getLang() === 'tr' ? 'tr-TR' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }
}

function showWaypointCard(missionId, wpIdx) {
  removeWaypointCard();
  const html = renderWaypointCard(missionId, wpIdx);
  if (!html) return;
  const container = document.createElement('div');
  container.id = 'waypoint-card-container';
  container.innerHTML = html;
  document.body.appendChild(container);

  // Auto-dismiss after 5 seconds
  if (waypointCardTimeout) clearTimeout(waypointCardTimeout);
  waypointCardTimeout = setTimeout(removeWaypointCard, 5000);
}

function removeWaypointCard() {
  const existing = document.getElementById('waypoint-card-container');
  if (existing) existing.remove();
  if (waypointCardTimeout) {
    clearTimeout(waypointCardTimeout);
    waypointCardTimeout = null;
  }
}

function wireMissionHUDHandlers(missionId) {
  const playBtn = document.getElementById('mission-play-btn');
  const speedBtn = document.getElementById('mission-speed-btn');
  const cameraBtn = document.getElementById('mission-camera-btn');
  const exitBtn = document.getElementById('mission-exit-btn');
  const closeBtn = document.getElementById('mission-hud-close');
  const track = document.getElementById('timeline-track');

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (!missionRenderer) return;
      const playing = missionRenderer.toggle();
      playBtn.innerHTML = playing ? '&#9646;&#9646;' : '&#9654;';
      playBtn.classList.toggle('active', playing);
    });
  }

  if (speedBtn) {
    speedBtn.addEventListener('click', () => {
      missionSpeedIndex = (missionSpeedIndex + 1) % missionSpeeds.length;
      const speed = missionSpeeds[missionSpeedIndex];
      if (missionRenderer) missionRenderer.setSpeed(speed);
      const label = document.getElementById('mission-speed-label');
      if (label) label.textContent = speed + 'x';
    });
  }

  if (cameraBtn) {
    cameraBtn.addEventListener('click', () => {
      if (!missionRenderer) return;
      const following = missionRenderer.toggleCameraFollow();
      cameraBtn.classList.toggle('active', following);
    });
  }

  const doExitMission = () => {
    exitMissionMode();
    currentMissionId = null;
    missionContent.innerHTML = renderMissionList();
    wireMissionListHandlers();
  };

  if (exitBtn) exitBtn.addEventListener('click', doExitMission);
  if (closeBtn) closeBtn.addEventListener('click', doExitMission);

  // Timeline scrubber: click to seek
  if (track) {
    const seekToPosition = (clientX) => {
      const rect = track.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      if (missionRenderer) {
        missionRenderer.seekTo(progress);
        updateMissionHUD(progress, null);
      }
    };

    track.addEventListener('click', (e) => {
      seekToPosition(e.clientX);
    });

    // Drag playhead
    const playhead = document.getElementById('timeline-playhead');
    if (playhead) {
      let isDragging = false;

      const startDrag = (e) => {
        isDragging = true;
        if (missionRenderer) missionRenderer.pause();
        e.preventDefault();
      };

      const onDrag = (e) => {
        if (!isDragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        seekToPosition(clientX);
      };

      const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
      };

      playhead.addEventListener('mousedown', startDrag);
      playhead.addEventListener('touchstart', startDrag, { passive: false });
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('touchmove', onDrag, { passive: true });
      document.addEventListener('mouseup', endDrag);
      document.addEventListener('touchend', endDrag);
    }

    // Waypoint dots: click to jump
    const dots = track.querySelectorAll('.timeline-waypoint-dot');
    dots.forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(dot.dataset.waypointIndex, 10);
        if (missionRenderer && missionRenderer.waypointProgressPositions[idx] !== undefined) {
          missionRenderer.seekTo(missionRenderer.waypointProgressPositions[idx]);
          showWaypointCard(missionId, idx);
        }
      });
    });
  }
}

if (btnMissions) {
  btnMissions.addEventListener('click', () => {
    if (missionModeActive) {
      exitMissionMode();
      closeMissionPanel();
      return;
    }
    const isHidden = missionPanel.classList.contains('hidden');
    if (isHidden) {
      openMissionPanel();
    } else {
      closeMissionPanel();
    }
  });
}

if (missionClose) {
  missionClose.addEventListener('click', closeMissionPanel);
}

// ==================== Cinematic Tour ====================

if (btnTour) {
  btnTour.addEventListener('click', () => {
    if (!scene) return;

    if (!cinematicTour) {
      cinematicTour = new CinematicTour(scene);
      cinematicTour.onPlanetVisit = (key) => {
        openInfoPanel(key);
      };
      cinematicTour.onTourEnd = () => {
        btnTour.classList.remove('active');
        closeInfoPanel();
        audioManager.setContext('overview');
      };
    }

    const active = cinematicTour.toggle();
    btnTour.classList.toggle('active', active);

    if (active) {
      // Trigger epic music for tour
      audioManager.setContext('mission');
    } else {
      audioManager.setContext('overview');
      closeInfoPanel();
    }
  });
}

// ==================== Solar Storm ====================

if (btnStorm) {
  btnStorm.addEventListener('click', () => {
    if (!scene) return;

    if (solarStorm && solarStorm.isActive) {
      // If already active, either launch new CME or deactivate
      solarStorm.deactivate();
      solarStorm = null;
      btnStorm.classList.remove('active');
      return;
    }

    // Build planet data lookup for the simulation
    const planetDataLookup = {};
    for (const key of [...PLANET_ORDER, ...DWARF_PLANET_ORDER]) {
      const data = SOLAR_SYSTEM[key] || DWARF_PLANETS[key];
      if (data) planetDataLookup[key] = data;
    }

    solarStorm = new SolarStormSimulation(
      scene.scene,
      (key) => scene.getPlanetWorldPosition(key),
      planetDataLookup
    );
    solarStorm.activate();
    btnStorm.classList.add('active');

    // Go to overview for best view
    scene.goToOverview();
  });
}

// ==================== Quiz Panel ====================

function openQuizPanel() {
  quizActive = false;
  quizQuestions = [];
  quizCurrentIndex = 0;
  quizResults = [];
  quizSelectedCategory = null;
  quizContent.innerHTML = renderQuizMenu();
  quizPanel.classList.remove('hidden');
  quizPanel.setAttribute('aria-hidden', 'false');
  // Close other panels
  infoPanel.classList.add('hidden');
  infoPanel.setAttribute('aria-hidden', 'true');
  comparePanel.classList.add('hidden');
  comparePanel.setAttribute('aria-hidden', 'true');
  missionPanel.classList.add('hidden');
  missionPanel.setAttribute('aria-hidden', 'true');
  btnCompare.classList.remove('active');
  btnCompare.setAttribute('aria-pressed', 'false');
  btnMissions.classList.remove('active');
  btnQuiz.classList.add('active');
  wireQuizMenuHandlers();
}

function closeQuizPanel() {
  quizPanel.classList.add('hidden');
  quizPanel.setAttribute('aria-hidden', 'true');
  btnQuiz.classList.remove('active');
  quizActive = false;
}

function wireQuizMenuHandlers() {
  const categoryCards = quizContent.querySelectorAll('.quiz-category-card');
  categoryCards.forEach(card => {
    card.addEventListener('click', () => {
      // Toggle selection
      categoryCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      quizSelectedCategory = card.dataset.category;
    });
  });

  const startBtn = document.getElementById('quiz-start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (!quizSelectedCategory) {
        // Default to first category if none selected
        quizSelectedCategory = 'planets';
      }
      const diffSelect = document.getElementById('quiz-difficulty');
      const countSelect = document.getElementById('quiz-count');
      const difficulty = diffSelect ? parseInt(diffSelect.value, 10) : 0;
      const count = countSelect ? parseInt(countSelect.value, 10) : 10;
      startQuiz(quizSelectedCategory, difficulty, count);
    });
  }
}

function startQuiz(category, difficulty, count) {
  quizQuestions = filterQuestions(category, difficulty, count);
  if (quizQuestions.length === 0) {
    // Fallback: get all from category
    quizQuestions = filterQuestions(category, 0, count);
  }
  quizCurrentIndex = 0;
  quizResults = [];
  quizStartTime = Date.now();
  quizActive = true;
  showQuizQuestion();
}

function showQuizQuestion() {
  if (quizCurrentIndex >= quizQuestions.length) {
    showQuizSummary();
    return;
  }
  const question = quizQuestions[quizCurrentIndex];
  quizContent.innerHTML = renderQuizQuestion(question, quizCurrentIndex, quizQuestions.length, null);
  wireQuizQuestionHandlers(question);
}

function wireQuizQuestionHandlers(question) {
  const options = quizContent.querySelectorAll('.quiz-option');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      const selectedIndex = parseInt(opt.dataset.index, 10);
      const isCorrect = selectedIndex === question.correct;
      quizResults.push({ question, selectedAnswer: selectedIndex, correct: isCorrect });

      // Show result
      quizContent.innerHTML = renderQuizResult(question, selectedIndex);

      // Add next button
      const nextBtn = document.createElement('button');
      nextBtn.className = 'quiz-next-btn';
      nextBtn.textContent = quizCurrentIndex < quizQuestions.length - 1 ? t('quiz.next') : t('quiz.score');
      quizContent.querySelector('.quiz-result').appendChild(nextBtn);

      nextBtn.addEventListener('click', () => {
        quizCurrentIndex++;
        showQuizQuestion();
      });

      // Wire "Learn More" button
      const learnMoreBtn = quizContent.querySelector('.quiz-learn-more');
      if (learnMoreBtn) {
        learnMoreBtn.addEventListener('click', () => {
          const planetKey = learnMoreBtn.dataset.planet;
          closeQuizPanel();
          openInfoPanel(planetKey);
        });
      }
    });
  });
}

function showQuizSummary() {
  quizActive = false;
  const totalTime = (Date.now() - quizStartTime) / 1000;
  quizContent.innerHTML = renderQuizSummary(quizResults, totalTime);

  const playAgainBtn = document.getElementById('quiz-play-again');
  if (playAgainBtn) {
    playAgainBtn.addEventListener('click', () => {
      openQuizPanel();
    });
  }
}

if (btnQuiz) {
  btnQuiz.addEventListener('click', () => {
    const isHidden = quizPanel.classList.contains('hidden');
    if (isHidden) {
      openQuizPanel();
    } else {
      closeQuizPanel();
    }
  });
}

if (quizClose) {
  quizClose.addEventListener('click', closeQuizPanel);
}

// ==================== Info Panel Drag-to-Dismiss (Mobile) ====================

if (infoDragHandle) {
  let dragStartY = 0;
  let panelStartY = 0;
  let isDragging = false;

  infoDragHandle.addEventListener('touchstart', (e) => {
    if (window.innerWidth >= 768) return;
    isDragging = true;
    dragStartY = e.touches[0].clientY;
    panelStartY = infoPanel.getBoundingClientRect().top;
    infoPanel.style.transition = 'none';
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const dy = e.touches[0].clientY - dragStartY;
    if (dy > 0) {
      infoPanel.style.transform = `translateY(${dy}px)`;
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    infoPanel.style.transition = '';
    const currentY = parseInt(infoPanel.style.transform.replace(/[^0-9-]/g, '')) || 0;
    if (currentY > 120) {
      closeInfoPanel();
    }
    infoPanel.style.transform = '';
  });
}

// ==================== Keyboard Shortcuts ====================

function toggleKeyboardHelp() {
  keyboardHelpVisible = !keyboardHelpVisible;
  const existing = document.getElementById('keyboard-help-overlay');
  if (existing) {
    existing.remove();
    keyboardHelpVisible = false;
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'keyboard-help-overlay';
  overlay.className = 'keyboard-help-overlay';
  overlay.innerHTML = `
    <div class="keyboard-help">
      <h2>${t('keyboard.title')}</h2>
      <div class="keyboard-help-row"><span>${t('keyboard.selectPlanet')}</span><kbd>1</kbd> – <kbd>9</kbd></div>
      <div class="keyboard-help-row"><span>${t('keyboard.pauseResume')}</span><kbd>Space</kbd></div>
      <div class="keyboard-help-row"><span>${t('keyboard.closePanel')}</span><kbd>Esc</kbd></div>
      <div class="keyboard-help-row"><span>${t('keyboard.showHelp')}</span><kbd>?</kbd></div>
    </div>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      keyboardHelpVisible = false;
    }
  });
  document.body.appendChild(overlay);
  keyboardHelpVisible = true;
}

document.addEventListener('keydown', (e) => {
  // Keyboard help
  if (e.key === '?') {
    toggleKeyboardHelp();
    return;
  }

  if (e.key === 'Escape') {
    // Close keyboard help first if visible
    const helpOverlay = document.getElementById('keyboard-help-overlay');
    if (helpOverlay) {
      helpOverlay.remove();
      keyboardHelpVisible = false;
      return;
    }

    // Exit mission mode first
    if (missionModeActive) {
      exitMissionMode();
      currentMissionId = null;
      missionContent.innerHTML = renderMissionList();
      wireMissionListHandlers();
      return;
    }

    if (!infoPanel.classList.contains('hidden')) {
      closeInfoPanel();
    } else if (quizPanel && !quizPanel.classList.contains('hidden')) {
      closeQuizPanel();
    } else if (missionPanel && !missionPanel.classList.contains('hidden')) {
      closeMissionPanel();
    } else if (!comparePanel.classList.contains('hidden')) {
      comparePanel.classList.add('hidden');
      comparePanel.setAttribute('aria-hidden', 'true');
      btnCompare.classList.remove('active');
      btnCompare.setAttribute('aria-pressed', 'false');
    } else if (scene) {
      scene.goToOverview();
    }
  }

  // Number keys 1-9 for planets
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 9 && PLANET_ORDER[num - 1]) {
    openInfoPanel(PLANET_ORDER[num - 1]);
  }

  // Space to toggle pause
  if (e.key === ' ') {
    e.preventDefault();
    if (speeds[speedIndex] === 0) {
      speedIndex = 2;
    } else {
      speedIndex = 0;
    }
    if (scene) scene.setAnimationSpeed(speeds[speedIndex]);
    const speedDisplay = t(speedKeys[speedIndex]);
    speedLabel.textContent = speedDisplay;
    btnSpeed.setAttribute('aria-label', t('aria.speed') + ': ' + speedDisplay);
  }
});

// ==================== Touch / Swipe Support ====================

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

canvasContainer.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }
}, { passive: true });

canvasContainer.addEventListener('touchend', (e) => {
  if (e.changedTouches.length !== 1) return;

  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const dt = Date.now() - touchStartTime;

  // Must be a quick swipe: >50px horizontal, <300ms, more horizontal than vertical
  if (Math.abs(dx) > 50 && dt < 300 && Math.abs(dx) > Math.abs(dy)) {
    // Find current planet index
    const currentIdx = currentPlanetKey ? PLANET_ORDER.indexOf(currentPlanetKey) : -1;

    if (dx < 0) {
      // Swipe left → next planet
      const nextIdx = currentIdx < PLANET_ORDER.length - 1 ? currentIdx + 1 : 0;
      openInfoPanel(PLANET_ORDER[nextIdx]);
    } else {
      // Swipe right → previous planet
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : PLANET_ORDER.length - 1;
      openInfoPanel(PLANET_ORDER[prevIdx]);
    }
  }
}, { passive: true });

// ==================== URL Deep Linking ====================

function handleInitialHash() {
  const hash = window.location.hash.replace('#', '');
  if (hash && (SOLAR_SYSTEM[hash] || DWARF_PLANETS[hash])) {
    openInfoPanel(hash);
  }
}

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash && (SOLAR_SYSTEM[hash] || DWARF_PLANETS[hash])) {
    if (currentPlanetKey !== hash) {
      openInfoPanel(hash);
    }
  } else if (!hash) {
    closeInfoPanel();
  }
});

// ==================== Console welcome ====================
console.log(
  '%c OzMos %c Solar System Explorer ',
  'background: #4a9eff; color: white; font-size: 14px; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;',
  'background: #1a1a2e; color: #e8e8f0; font-size: 14px; padding: 4px 8px; border-radius: 0 4px 4px 0;'
);
