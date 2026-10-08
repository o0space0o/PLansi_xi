# PLansi_xi — implementation reference

## Project layout

| Path                  | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `dist/`               | Complete browser application; served without a build step           |
| `dist/assets/`        | Ready-to-use textures and source metadata                           |
| `dist/assets/models/` | NASA Hubble GLB with embedded PBR textures                          |
| `dist/vendor/`        | Locally bundled Three.js modules and addons                         |
| `Audio/`              | Local playlist; add music here                                      |
| `runtime/`            | Official portable Windows Node.js runtimes, checksums, and licenses |
| `scripts/`            | Server, asset preparation, documentation, and validation tools      |
| `docs/`               | Design, behavior, and verification reference                        |
| `original-assets/`    | Large source downloads retained for reprocessing                    |
| `artifacts/`          | Local verification captures; not required to run                    |

`dist` is both source and the ready-to-run application. Do not edit bundled vendor files. `npm install` regenerates the two Three.js engine modules and 14 required addons through `scripts/vendor.mjs`, following their transitive local imports. Previous generated bundles are preserved in `original-assets`. The server exposes `dist`, an allowlisted audio streaming route, and the playlist route; it does not expose the rest of the project.

The double-click launcher selects the official bundled x64/ARM64 runtime. `serve.mjs --port 4174` can select another loopback-only port. Running the package needs no npm install or build. Large textures are streamed from disk, and HEAD requests inspect file metadata without allocating their entire bodies. A loopback health route identifies an existing PLansi_xi server before the launcher reuses an occupied port. Contributors use the pinned development dependencies for asset preparation, Markdown-to-HTML guide generation, tests, and formatting.

## Scene and camera

`main.js` owns the scene, camera journeys, pointer selection, input, frame-rate diagnostics, and WebMCP access. `animation.js` owns six independent clocks: background, Earth, Luna, Kepler X, Aurelia, and Hubble. Prescribed circular orbits are nested: the star → Earth → Luna/Hubble; the star → Kepler X → Aurelia. World radii and orbital spacing are artistic, not a scale model.

TrackballControls supports continuous rotations through the poles without a fixed world-up restriction. Navigation uses a quintic eased trajectory, predicts the target's orbital motion, and chooses an elevated route checked against nearby globes. Transporting the current camera-up direction avoids a sudden roll reset. The camera follows the selected moving body after arrival.

Wheel animation speed ranges from paused to 80×. The wheel raycasts the current pointer position and changes only the hit object's clock; empty sky changes the background clock. Aurelia's rings select Aurelia. Each body's clock supplies its orbital phase, spin, and cloud motion; child positions add the parent's current position without inheriting its clock rate. Future camera positions recursively predict each ancestor using its independent clock. Camera travel duration and music speed remain unchanged. Reloading restores the system view and all rates to 1×.

## Photographic sky and starlight

`sky.js` renders the NOIRLab all-sky photograph inside a sphere centered on the camera. Its orientation is fixed, so camera translation produces no false nearby stellar parallax. Panorama UV coordinates come from each fragment's normalized direction. Analytic UV derivatives keep texture filtering continuous across longitude zero. `scripts/fetch-photo-sky.mjs` downloads the 40000 × 20000 source and prepares 16K and 8K versions with Lanczos3, quality 96, 4:4:4 JPEG. It applies no blur or generated image content. The source photograph can retain capture/stitching artifacts, especially near poles; these are not additional scene geometry.

There are no added star meshes, particles, or sprites. The stars and nebulae are entirely photographic. `scripts/prepare-starlight.mjs` analyzes a 4096 × 2048 copy and identifies 2201 isolated bright photographic regions. A blurred analysis copy supplies local contrast; this blur is never applied to the displayed photograph. The generated RGBA response map stores weight, coherent phase, and frequency variation. Its metadata includes the source photo's SHA-256 hash.

The fragment shader samples the photograph and response map at the same panorama coordinates. Existing linear RGB values receive bounded, smoothly varying multiplicative gains: brightness varies by at most 28%, while the red/blue gain varies by at most 14% around its base. Two smoothly combined oscillations give nonidentical timing per photographed region. There is no per-frame random noise, texture-coordinate displacement, or broad moving cloud tint. A black source pixel remains black. The shader renders one background sphere before foreground geometry, so it cannot overlay stars onto Earth or affect a planet's shading.

This is an optional atmospheric observing treatment, not a measured turbulence or interstellar-dust simulation. The moving procedural density volume has been removed: real dust extinction is already captured in the photograph. **T** disables shimmer for the steady space view; **H** opens the instructions. Both work outside music mode. [The image comparison](starlight-science.md) documents the primary ESO/ESA sources and explains why random pixel colors or moving dust sheets would misrepresent the mechanism.

GPUs with a texture limit of at least 16384 use the 16K sky and 8K night/cloud maps by default, regardless of reported system memory. Smaller GPU limits or an explicit `?quality=8k` select the 8K sky and 4K maps. Render resolution follows native device pixel density, including display-density changes on resize. The HDR composer target uses the GPU's supported maximum MSAA sample count; canvas antialiasing alone does not cover a postprocessed scene. Frame rate is measured without reducing resolution automatically.

## Planet and ring lighting

`shaders.js` combines the surface maps, relief normals, ocean specular response, city lights, cloud shadows, and atmosphere. `shadow-lighting.js` shares finite-disc eclipse geometry between the GLSL surfaces and spacecraft lighting. Overlap of the star's apparent angular disc with an occluder's disc produces full umbra, partial penumbra, and annular visibility.

The ring's visible density and its shadow use the same radial bands, gaps, and edge fade. Transmission follows `exp(-opticalDepth / incidence)`. Nine samples over the luminous disc soften a ring shadow with distance. All globe, cloud, and atmosphere materials receive ring shadows when the geometry aligns; shadows are not restricted to Aurelia. A ring near Aurelia cannot shadow Earth when Earth is nowhere along its light ray. The ring uses view-dependent transparency and an approximate single-scattering reflection/transmission response.

Research references: [Stellarium's planet shader](https://github.com/Stellarium/stellarium/blob/master/data/shaders/planet.frag) and [I, Voyager's ring shader](https://github.com/ivoyager/ivoyager_core/blob/master/shaders/rings.gdshader). The local circle-overlap and optical-depth implementation was written for this project; these references were not imported as dependencies.

## Hubble and satellite music

`satellite.js` loads the [NASA VTAD Hubble model](https://science.nasa.gov/resource/hubble-space-telescope-3d-model/), including 11 meshes and 10 embedded textures. Physical metal materials reflect a PMREM derived from a 2048 × 1024 copy of the photographic sky. A 4096 × 4096 local shadow map (bounded by the GPU texture limit) provides spacecraft self-shadowing; analytic finite-star visibility supplies Earth eclipse shading. All mapped surfaces use the GPU's maximum anisotropic filtering. Earthshine and a low ambient fill retain readable detail. The model is enlarged for visibility and follows an illustrative circular Earth orbit.

`music-controls.js` owns the hidden input mode. Capture-phase handlers consume music inputs before camera controls. A 650 ms hold changes tracks once and suppresses the short-click action. Closing the mode cancels pending holds and releases pointer capture. Exiting the mode leaves playback running.

`music.js` creates the Web Audio graph only after playback is requested:

```text
HTML audio → low-pass → obstruction gain → HRTF panner
                                      ├→ dry ────────────────┐
                                      ├→ convolution reverb ─┤
                                      └→ filtered delay ─────┤
                                         ↖ feedback         │
                                             master → compressor → output
```

The satellite is the panner's source; camera position and orientation define the listener. A sphere/segment intersection finds intervening planets and moons. Chord depth smoothly lowers cutoff from 20 kHz toward 650 Hz and reduces gain, with smoothed audio parameters to avoid clicks. The effect is cinematic, radio-inspired sound design: [NASA explains that sound needs a medium](https://science.nasa.gov/ems/02_anatomy/), so this is not literal sound propagation through vacuum. Music remains independent of the simulation clock.

`scripts/music-server.mjs` scans immediate files in `Audio`, prioritizes Words before sleep, and sorts the rest by filename. It supports byte ranges so large local tracks can stream and seek. Only recognized audio filenames are served; arbitrary paths and non-audio files are rejected. Playlist refresh happens on entry to music mode and track changes. Music never leaves the local computer.

## Maintenance

- Run `npm run check` for syntax, runtime references, actual texture sizes, response-map dimensions, and GLB structure.
- Run `npm test` for music input/streaming, audio obstruction, finite eclipses, photographic response registration, the complete browser-module graph, and runtime checksums.
- `npm run format` / `npm run format:check` maintain consistent readable formatting. Vendor files and assets are excluded.
- `npm run docs` regenerates `Guide.html` and `dist/help.html` from the Markdown references. The former opens offline; the latter is served by the website. Research images carry source/license metadata.
- Asset acquisition scripts record upstream sources. `fetch-photo-sky.mjs` regenerates the photographic sky; run `prepare-starlight.mjs` afterwards. `fetch-references.mjs` prepares the guide's observation images. `fetch-runtime.mjs` verifies portable Node.js against official upstream SHA-256 checksums. The NASA catalog-processing script writes to `original-assets/nasa-reference/` and does not replace the rendered sky.
- The GitHub repository contains the application, required vendor modules, prepared assets, both official Windows runtimes, documentation, and an Audio-folder README. `.gitignore` excludes all songs, local Firebase configuration and deployment caches, dependency caches, original acquisition files, QA captures, and ZIP exports. Existing ZIP exports were removed. The repository is the reference copy.
- WebMCP tools mirror application actions: `get_observatory_state`, `navigate_world`, `adjust_animation_speed`, `control_satellite_music`. State includes the audio obstruction, output level, sky method, camera journey, and simulation clocks. No visible control panel is added.
