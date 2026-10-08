# PLansi_xi 1.3.0 — validation, 8 October 2026

## One main universe

The original black hole remains, orbiting Kepler X at 28 scene units with an inclined orbital plane. Its disk changes orientation continuously through diagonal angles. The spiral galaxy, ionized nebula and molecular cloud occupy separate distant directions in the main universe. The separate throat, wormhole shader, Ellis ray table and environment-crossing lifecycle have been removed. The ordinary universe view has no labels or visible controls. [Model assumptions and memory behavior](space-objects.md).

## Automated verification

All 34 behavioral checks pass. They cover independent clocks, graphics overload/recovery and memory bounds, asynchronous GPU timing, texture replacement/cancellation, music inputs and streaming, audio obstruction, eclipses, photographic response registration, browser-module resolution and official runtime checksums.

The space-object checks verify finite 3D density fields, emission/absorption invariance, Schwarzschild shadow capture and convergence, physical reference lengths and Doppler directionality. New checks project every volume-box corner into landscape, portrait and square cameras at the actual visit distance; verify a constant-radius inclined orbit and continuous normalized disk orientations; and confirm that completed volume refinement still consumes fresh foreground frames and positions. A camera change immediately invalidates the volume cache. Reduced memory budgets can shrink resident detail even before all allocations fit. Public controls expose no crossing action.

`npm run check` passes JavaScript/server syntax, HTML references, local engine imports, actual texture dimensions, response maps and the Hubble GLB. Verified maximum sizes are Earth 5400 × 2700, Luna 4096 × 2048, cloud/night maps 8192 × 4096, Kepler 1774 × 887 and the photographic sky 16384 × 8192. Prepared 8K/4K/2K alternatives remain available. Hubble contains 11 meshes and ten embedded textures.

Formatting, whitespace checks, generated guide references and the standalone portable-runtime server smoke test are part of release verification. Songs remain local and excluded from Git.

## Browser verification and limits

The combined renderer was inspected at 1920 × 1080 in the Codex Chromium browser using `?quality=highest`. The overview contains the galaxy and both clouds, with one resident environment. The galaxy approach completed at 264 scene units (4.8 × 55); its measured minimum clearance was 86.16 units. The nebula approach completed at 163.2 units (4.8 × 34) with 66.97 units of minimum clearance. The molecular-cloud approach completed at 158.4 units (4.8 × 33), with 116.74 units of minimum clearance. The retained black-hole approach completed with 11.39 units of clearance. Native pointer input selected the visible galaxy, and keyboard shortcuts selected the clouds and retained black hole. No shader or texture errors were reported. Captures in the guide are from the real renderer.

The galaxy view completed all 64 native-pixel refinement batches with 192 depth samples. Its dominant field used 128³ while the offscreen fields shrank to 48³, costing about 19 MiB including retained density data; the HDR volume cache added about 16 MiB. Render DPR stayed at 1. The planets' numeric clocks and black-hole orientation continued advancing while the camera stayed still and the matter cache was complete.

An earlier active combined-scene run, before the final position adjustment, observed about 60 FPS with 12–14 ms GPU time at native 1080p. The later automation session was paced near one frame per second while the app chat was inactive; its frame rate and GPU query timings are unsuitable as a foreground performance benchmark. Under that condition the optimizer retained native HD output and reduced photographic tiers/secondary effects, reporting roughly 375 MiB estimated graphics memory. This does not establish an Edge frame-rate guarantee. The final layout, shader compilation, memory streaming and camera bounds were verified; foreground benchmarking in Edge remains device/backend dependent.

Earlier Edge diagnostics found D3D11 WARP/software-rendering flags despite hardware acceleration being configured. Enabling the setting alone does not verify the active backend. `edge://gpu` and a fresh browser process establish whether hardware rendering is active.

## Practical limits

Free GPU memory is not exposed by browsers; allocation values and RAM hints are estimates. Worker generation, uploads and refinement can cause transient stalls. Hidden tabs pause scene work; browser or operating-system pacing can also limit animation opportunities. An actual out-of-memory event was not induced.

The scene uses prescribed illustrative circular orbits, normalized spatial/optical scales, spherical eclipse bounds and finite ray budgets. The black-hole metric is Schwarzschild; disk precession is prescribed rather than a calculated torque or rotating Kerr spacetime. Galaxy and cloud densities are original physically motivated models, not downloaded TNG observations or a hydrodynamic/N-body calculation. Volume-background extinction and foreground silhouette masks use documented approximations. Optional panorama shimmer is an atmospheric observing treatment. Music obstruction is cinematic radio sound design.

`scripts/smoke-project.mjs` launches the included official runtime on its own port without an application build, checks the app/guide/assets/module routes, verifies rejected HTTP handling and exercises local audio byte ranges. It terminates only its own test server. The user's existing preview instance remains available.
