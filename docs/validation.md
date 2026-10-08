# PLansi_xi 1.3.1 — validation, 8 October 2026

## One main universe

The black hole, lensing renderer, orbital data, animation target, B/6 shortcuts and curved-ray helpers are removed. The spiral galaxy, ionized nebula and molecular cloud retain their distant positions and safe approach distances in the main universe. The separate throat, wormhole shader, Ellis ray table and environment-crossing lifecycle are also absent. The ordinary universe view has no labels or visible controls. [Model assumptions and memory behavior](space-objects.md).

## Automated verification

All 31 behavioral checks pass. They cover independent clocks, graphics overload/recovery and memory bounds, asynchronous GPU timing, texture replacement/cancellation, music inputs and streaming, audio obstruction, eclipses, photographic response registration, browser-module resolution and official runtime checksums.

The space-object checks verify finite 3D density fields, emission/absorption invariance and a constant-radius inclined planetary orbit. They project every volume-box corner into landscape, portrait and square cameras at the actual visit distance and confirm that completed volume refinement still consumes fresh foreground frames and positions. A camera change immediately invalidates the volume cache. Reduced memory budgets can shrink resident detail even before all allocations fit. Public controls expose neither a black-hole target nor a crossing action.

`npm run check` passes JavaScript/server syntax, HTML references, local engine imports, actual texture dimensions, response maps and the Hubble GLB. Verified maximum sizes are Earth 5400 × 2700, Luna 4096 × 2048, cloud/night maps 8192 × 4096, Kepler 1774 × 887 and the photographic sky 16384 × 8192. Prepared 8K/4K/2K alternatives remain available. Hubble contains 11 meshes and ten embedded textures.

Formatting, whitespace checks, generated guide references and the standalone portable-runtime server smoke test are part of release verification. Songs remain local and excluded from Git.

## Browser verification and limits

After removal, the renderer was inspected at 1280 × 720 in the Codex Chromium browser using `?quality=highest`. State and advertised tools contain the planets, Hubble, galaxy and both clouds, with no black-hole target or clock. Pressing B and 6 leaves the overview unchanged. The overview loaded at native DPR 1, ultra quality and approximately 60 FPS, with no shader or texture warnings. Captures in the guide are from the real renderer.

The earlier 1.3.0 combined-scene verification used 1920 × 1080. Galaxy, nebula and molecular-cloud approaches completed at 264, 163.2 and 158.4 scene units respectively (4.8 radii), with positive clearance. Their positions and approach limits are unchanged in 1.3.1.

In that earlier run, the galaxy view completed all 64 native-pixel refinement batches with 192 depth samples. Its dominant field used 128³ while the offscreen fields shrank to 48³, costing about 19 MiB including retained density data; the HDR volume cache added about 16 MiB. Render DPR stayed at 1. Planet clocks continued advancing while the camera stayed still and the matter cache was complete.

An earlier active combined-scene run, before the final position adjustment, observed about 60 FPS with 12–14 ms GPU time at native 1080p. The later automation session was paced near one frame per second while the app chat was inactive; its frame rate and GPU query timings are unsuitable as a foreground performance benchmark. Under that condition the optimizer retained native HD output and reduced photographic tiers/secondary effects, reporting roughly 375 MiB estimated graphics memory. This does not establish an Edge frame-rate guarantee. The final layout, shader compilation, memory streaming and camera bounds were verified; foreground benchmarking in Edge remains device/backend dependent.

Earlier Edge diagnostics found D3D11 WARP/software-rendering flags despite hardware acceleration being configured. Enabling the setting alone does not verify the active backend. `edge://gpu` and a fresh browser process establish whether hardware rendering is active.

## Practical limits

Free GPU memory is not exposed by browsers; allocation values and RAM hints are estimates. Worker generation, uploads and refinement can cause transient stalls. Hidden tabs pause scene work; browser or operating-system pacing can also limit animation opportunities. An actual out-of-memory event was not induced.

The scene uses prescribed illustrative circular orbits, normalized spatial/optical scales, spherical eclipse bounds and finite ray budgets. Galaxy and cloud densities are original physically motivated models, not downloaded TNG observations or a hydrodynamic/N-body calculation. Volume-background extinction and foreground silhouette masks use documented approximations. Optional panorama shimmer is an atmospheric observing treatment. Music obstruction is cinematic radio sound design.

`scripts/smoke-project.mjs` launches the included official runtime on its own port without an application build, checks the app/guide/assets/module routes, verifies rejected HTTP handling and exercises local audio byte ranges. It terminates only its own test server. The user's existing preview instance remains available.
