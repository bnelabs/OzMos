# OzMos Major Overhaul Plan
*Generated 2026-02-21 — synthesized from 5-agent specialist review*

---

## CRITICAL BUGS (Fix Before Anything Else)

### B1. Yellow Dotted Lines from Sun
- **Source:** SolarStormSimulation.js — magnetic field lines rendered when storm is idle/active
- **Fix:** Locate all THREE.LineDashedMaterial / particle emitters in SolarStormSimulation.js that render from sun surface; remove or gate strictly to active storm state
- **Effort:** 1h

### B2. Planets Drift Off Orbits at High Speed
- **Source:** SolarSystemScene.js — deltaTime-based date advance through `advanceDateStr()` → `julianToDateStr()` → `dateToJulian()` string chain accumulates floating-point error at 10x+
- **Fix:** Cache Julian date each frame; add `MAX_DAYS_PER_FRAME = 30` cap in `_animate()`; add NaN/Infinity guard on `orbitGroup.rotation.y`
- **Note (devil's advocate):** Inner planets orbiting faster than outer ones IS correct Kepler — add educational tooltip to explain this instead of "fixing" it
- **Effort:** 3h

### B3. Mars Sits Inside Asteroid Belt Visually
- **Source:** solarSystem.js — Mars `orbitRadius: 52`, asteroid belt renders at ~54–70 units
- **Fix:** Increase Mars to 55 units (matching scale factor 36 × 1.524 AU); shift AsteroidBelt.js inner radius to 60, outer to 85
- **Effort:** 1h

---

## PHASE 1 — Quick Wins (1–2 weeks, ~18h total)

### P1.1 Favicon
- Inline SVG in `index.html <head>`: yellow sun circle + 3 orbit rings + 3 planet dots
- No external file needed
- **Effort:** 30min

### P1.2 Navigation Menu Redesign (Apple-style)
- Remove all emoji (🚀🧠⚡🎵🎬) — replace with clean SVG icons or minimal unicode (☀ ◎ ⊙)
- Establish button hierarchy: primary (Overview, Compare) / secondary (Missions, Quiz, Tour, Storm) / utility (Speed, Orbits, Labels) / media (Music, Fullscreen)
- Mobile-first: hamburger collapses to icon-only strip, labels appear on hover/focus desktop
- CSS: add `.nav-btn--primary`, `.nav-btn--secondary`, `.nav-btn--utility` modifiers
- **Effort:** 3h

### P1.3 Planet Bar — Mobile Polish
- Hide text labels below 480px (show only color dots)
- Reduce height from ~60px to ~44px on mobile
- Add minimize/expand toggle for power users
- **Effort:** 1.5h

### P1.4 Splash Screen — Shuttle Countdown
- Source NASA shuttle countdown audio from archive.org (public domain, clean versions available)
- Sequence: [audio starts] "T-minus 3… 2… 1… ignition… liftoff" → [brief engine rumble] → dedication poem fades in
- Keep music volume near zero during countdown; crossfade to ambient after
- **Effort:** 2.5h

### P1.5 Atmosphere Shader — Rayleigh Scattering
- 10-line addition to `atmosphereShader.js`: wavelength-dependent scattering (blue 4× more than red)
- Separate `uThickness` uniform per planet: Venus (opaque yellow), Mars (thin salmon), Earth (normal)
- **Effort:** 1h

### P1.6 Milky Way Background
- Download ESA/NASA equirectangular galaxy panorama (public domain, ~5–8MB WebP)
- Second `THREE.SphereGeometry(2000)` layer over starfield, opacity 0 at camera < 400 units, fades to 0.5 at 800+
- **Effort:** 1.5h (download + integration)

### P1.7 Earth 8K Texture
- Source: NASA Visible Earth (visibleearth.nasa.gov) — public domain 8K RGB
- Desktop only: serve 8K if `window.devicePixelRatio > 1.5 && !isMobile()`; mobile stays 2K
- **Effort:** 1h (download, WebP conversion, conditional loader)

### P1.8 Sun Storm — Temporal Context + Info Overlay
- Add DOM waypoint labels during CME animation: "Solar Surface → 0.5 AU (12h) → Earth (2–3 days)"
- Contextual tooltips: "CME expanding at 800 km/s", "Aurora triggered by particle impact", "Magnetosphere compressed"
- All strings go through i18n system; TR translations required
- **Effort:** 2h

### P1.9 Chromosphere / Corona Shader Distinction
- Add `uChromosphere` uniform to `sunShader.js`; thin red limb layer distinct from diffuse corona
- **Effort:** 1h

---

## PHASE 2 — Major Redesigns (3–5 weeks, ~60h total)

### P2.1 Cross-Section Interior View (Complete Redesign)
**Problems:** Half-apple overspills on small screens; badge-to-layer number matching confusing; animation uninspired; not scientifically representative.

**Solution:**
- **Layout:** True responsive split — canvas (60% width) | sidebar layer list (40%) on ≥ 768px; stacked on mobile
- **Overflow fix:** `max-height: calc(100vh - 120px)` with `overflow: hidden` on canvas container; scale canvas to fit
- **Layer identification:** Replace floating number badges with color-coded left border on sidebar cards matching a color ring on the canvas cutaway. Hover/tap a card → highlights that layer on canvas (glow effect)
- **Animation:** Replace "apple slice" with animated cutaway: planet starts whole, slices away in 3D rotation revealing interior layers in sequence, with camera tracking inward
- **Detail panel:** Click any layer card → expand panel with: composition %, temperature, pressure, depth — all sourced from `planetLayers.js`
- **Files:** `CrossSectionViewer.js`, `main.css` cross-section section (~300 lines affected)
- **Effort:** 8h

### P2.2 Compare Panel — Museum Quality
**Problems:** Basic data table, no interactivity, weak hierarchy.

**Solution:**
- **Layout:** Side-by-side card pair with hero image (planet texture thumbnail), name, classification badge
- **Scale visualization:** Animated SVG showing relative size comparison (circles scaled to real radius ratio)
- **Data sections:** Stats → Atmosphere → Moons → Fun Facts (expandable accordions)
- **Filter bar:** Filter comparison metrics (Size / Gravity / Distance / Temperature / Moons)
- **3 comparison modes:** 1v1 (current), Multi (up to 4), Timeline (same planet across epochs)
- **Files:** `ComparePanel.js` (rewrite), `main.css`
- **Effort:** 7h

### P2.3 Music Replacement
- **Replace 3 generic tracks** with licensed CC space ambient:
  - Calm: Carbon Based Lifeforms — *Interloper* (CC BY-NC)
  - Epic: Solar Fields — *Movements* series
  - Contemplative: Brian Eno ambient works or NASA sonification data (public domain)
- **Alternative:** Epidemic Sound subscription ($10/mo) — curated "sci-fi / space" playlists, commercially cleared
- **DO NOT use Holst "The Planets" recordings** — composition public domain but all recordings are copyright-protected
- **Effort:** 2h (sourcing, format conversion, drop-in replacement)

### P2.4 Sound Effects System
**Not overkill** — selective SFX enriches experience meaningfully.

- New module: `src/audio/SFXManager.js` — shares AudioManager's Web Audio context
- All effects procedurally synthesized (no new audio files):
  - Planet select: 180Hz sine bell, 80ms decay
  - Cross-section open: 60Hz resonant low tone
  - Solar storm start: Sub-bass rumble + crackling
  - Flyby: Doppler-shifted whoosh
  - Speed change: Subtle pitch shift on ambient
  - Tour transition: Soft chime
- **Effort:** 5h

### P2.5 Sun Storm — Full Realism Upgrade
- **CME Flux Rope:** `THREE.TubeGeometry` with helical twist expanding from sun; color-encodes magnetic field strength (red = strong / blue = weak)
- **New file:** `src/scene/CMEFluxRope.js`
- **Particle count cap at mobile:** Keep ≤ 80K particles; desktop can use 200K
- **Education panel:** Slide-in info card during storm with: what CME is, timeline to Earth, aurora explanation, real CME data comparison — fully i18n
- **Effort:** 6h

### P2.6 Rocky Planet Normal Maps
- Generate normal maps from existing textures via procedural bump conversion (`proceduralTextures.js`)
- Apply to: Mercury, Moon, Mars (most visually impactful for surface detail)
- **Effort:** 3h

### P2.7 Tour — Learning Experience Redesign
**Problems:** Silent, no context, no controls, no escape hint visible.

**Solution:**
- Tour HUD overlay: planet name, current fact (rotating 3–5 facts per stop), progress indicator (Mercury → ... → Neptune)
- Controls: Pause / Next Stop / Exit (always visible)
- Auto-narration timing: 8s per stop with smooth camera transition
- Factual content from existing `solarSystem.js` data + `planetLayers.js`
- **Effort:** 5h

### P2.8 Help System — Informational Overhaul
**Problems:** 3 static bullet-point sections; no planet info; no glossary.

**Solution:**
- Tabbed modal: **Quick Start** | **Features** | **Planet Guide** | **Glossary**
- Planet Guide: Each planet/body gets a card with 10 key facts (pulled from `solarSystem.js`), expandable to full data
- Glossary: 20–30 astronomical terms (AU, perihelion, Kepler, CME, etc.) — i18n'd
- Tutorial mode: Step-by-step overlay with arrows pointing to UI elements on first visit
- **Phase the content:** Start with 10 facts/body (manageable), mark as expandable for future Wikipedia-depth
- **Effort:** 6h

### P2.9 Texture Upgrades — Mars, Moon, Others
- Mars/Moon: 4K from NASA PDS (HiRISE/LRO) — public domain
- All planets: Solar System Scope CC BY pack (2K–4K) as baseline replacement
- Format: Convert to WebP (30% smaller than JPG at same quality)
- LOD: High-res only when camera within 50 scene units of planet
- **Effort:** 3h (download, conversion, LOD wiring)

### P2.10 Mission Journey — Visual Context
- Show planets at mission epoch (ghost spheres via `OrbitalMechanics.js` historical position)
- DOM timeline strip: mission phase labels synced to animation progress (Launch → Cruise → Arrival → etc.)
- Elliptical Hohmann transfer arc visualization (replace straight line segments)
- **Effort:** 6h

---

## PHASE 3 — Aspirational (Ongoing)

### P3.1 Object Click — 360° Studio Lighting
- On planet click/focus: activate `THREE.PMREMGenerator` HDR environment map
- Rotate key light slowly (360° reveal), rim light opposite, fill from above
- Disable while solar storm active (different lighting mode)
- **Effort:** 4h

### P3.2 Spatial Audio (Flyby)
- `THREE.AudioListener` on camera + `THREE.PositionalAudio` on planet meshes
- Distance-based rolloff for planet "ambience" during flyby
- **Warning:** iOS Safari latency — requires platform testing; ship stereo panning first
- **Effort:** 5h

### P3.3 Scale Explanation UI
- "Real vs Visual" toggle in info panel: explains why planet sizes are exaggerated
- Small educational card: "At true 1:1 scale, Earth would be invisible at this zoom level"
- **Effort:** 2h

### P3.4 Outer Solar System When Zoomed Out
- At camera > 600 units: fade in Kuiper Belt particle ring + Oort Cloud suggestion haze
- Solar system position marker relative to galaxy plane
- **Effort:** 4h

---

## WHAT NOT TO DO (Devil's Advocate Verdicts)

| Request | Verdict | Why |
|---|---|---|
| 8K textures on all platforms | ❌ Don't | 127MB VRAM kills mobile (iPhone budget: 200–400MB) |
| "True scale" solar system | ❌ Don't | Neptune becomes an invisible 0.003% dot — current exaggerated scale is MORE educational |
| Holst "The Planets" recordings | ❌ Don't | Composition public domain but all known recordings are copyright-protected |
| Wikipedia × 15 languages × all bodies | ❌ Don't yet | 400h+ maintenance. Phase: 10 facts/body, framework extensible |
| Full 3D spatial audio from day 1 | ⚠️ Phase | iOS latency issues; ship stereo panning first |
| 500K+ storm particles | ❌ Don't | Current 80K already near mobile GPU ceiling |

---

## IMPLEMENTATION ORDER (Recommended)

```
Week 1:  B1 + B2 + B3 (bugs)  +  P1.1 + P1.2 + P1.3 + P1.4 (quick wins pt1)
Week 2:  P1.5–P1.9 (remaining quick wins)
Week 3:  P2.1 (cross-section)  +  P2.3 + P2.4 (audio)
Week 4:  P2.2 (compare)  +  P2.5 (storm)  +  P2.7 (tour)
Week 5:  P2.8 (help)  +  P2.6 + P2.9 (textures)  +  P2.10 (missions)
Week 6+: Phase 3 items by priority
```

---

## EFFORT SUMMARY

| Phase | Items | Estimated Hours |
|---|---|---|
| Critical Bugs | 3 | 5h |
| Phase 1 Quick Wins | 9 | 14h |
| Phase 2 Major Redesigns | 10 | 51h |
| Phase 3 Aspirational | 4 | 15h |
| **Total** | **26** | **~85h** |

*No greenfield rewrite required. 100% incremental on existing architecture.*

---

## ASSET SOURCES (All Free / Public Domain / CC)

| Asset | Source | License |
|---|---|---|
| Earth 8K texture | NASA Visible Earth (visibleearth.nasa.gov) | Public Domain |
| All planet textures 2K–4K | Solar System Scope (solarsystemscope.com/textures) | CC BY 4.0 |
| Mars/Moon 4K | NASA PDS (pds-imaging.jpl.nasa.gov) | Public Domain |
| Milky Way panorama | ESA/NASA (esa.int gallery) | CC BY |
| Shuttle countdown audio | Internet Archive (archive.org) | Public Domain |
| Space ambient music | NASA Sonification (nasa.gov/audio) | Public Domain |
| Space ambient music (alt) | Carbon Based Lifeforms, Solar Fields | CC BY-NC |
| Space ambient music (paid) | Epidemic Sound | ~$10/month |
