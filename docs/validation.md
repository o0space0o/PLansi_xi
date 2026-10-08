# PLansi_xi 1.1.0 — validation, 8 October 2026

## Automated checks

`npm run check` validates application/server syntax, HTML asset references, local Three.js dependencies, actual texture dimensions, response-map dimensions, and the Hubble GLB. Verified sizes: Earth 5400 × 2700; Luna 4096 × 2048; clouds/night 8192 × 4096 with 4096 × 2048 fallbacks; Kepler 1774 × 887; photographic sky 16384 × 8192 and 8192 × 4096. The source is 40000 × 20000. Hubble contains 11 meshes and 10 embedded textures.

`npm test` passes thirteen behavioral checks:

1. Middle-button mode switching without consuming normal scene clicks.
2. Short play/stop clicks and suppressed music-mode context menu.
3. Long next/previous holds without duplicate short actions.
4. Cancelled holds on exit and wheel scope switching.
5. Playlist discovery, audio byte ranges, and rejected arbitrary/non-audio paths.
6. Full, partial, grazing, and clear sphere/segment audio obstruction.
7. Full, partial, and annular finite-disc eclipses.
8. Registration of the response map to the unchanged photo, with modulation restricted to bright photographic regions.
9. Resolution of every transitive browser-module import within the local runtime bundle.
10. Both portable Windows runtimes match the recorded official SHA-256 checksums.
11. Each pointed body's speed adjustment affects only its own clock.
12. Background pause/resume stays independent of body clocks and future orbit predictions.
13. Rates stay within 0–80×, paused targets resume, and invalid inputs cannot corrupt clocks.

`npm run format:check` checks consistent formatting. Generated HTML, vendor files, binary assets, and archives are excluded. Both the ARM64 and x64 Node.js executables report v24.21.0 when run on this Windows machine.

## Browser verification

The local in-app Chromium preview compiled the surface, atmosphere, ring, spacecraft, and photographic-shimmer shaders. The default selected the 16K sky, native pixel ratio 1, and 8 MSAA samples, with automatic resolution reduction disabled and no console warnings/errors. The observed frame rate was 60 FPS in the 974 × 884 viewport on this machine; this is an observation, not a guarantee for every device. The explicit 8K fallback also loaded successfully; its vendor PMREM shader reported a harmless tiny-constant precision warning, with no errors.

After the independent-clock update, Earth, Luna, Kepler, Aurelia, and Hubble approaches completed over 238–240 frames each. The respective measured minimum globe clearances were 18.43, 5.41, 5.41, 10.77, and 6.98 scene units. Native pointer/wheel input separately verified Earth, empty sky, Luna, Kepler, Aurelia, Aurelia's rings, and Hubble targeting. A 0.15-page upward wheel action changed only its target rate from 1 to approximately 1.489×; reversing it restored 1×. Paused Hubble retained its own orbital phase while Earth continued moving. Earlier checks covered responsive framing and horizontal/vertical turns exceeding 900 degrees. Wider approach framing is retained.

Native middle/left/right mouse input verified music entry, play, volume changes, stop/rewind, and exit while music continues. Both local WAV tracks decoded successfully. While in music mode, the wheel changed volume without changing the animation clock. Long holds were verified by real-timer automated input-handler tests; browser automation did not simulate a held native button.

Moving the camera behind Earth produced obstruction 0.961 with Earth as the blocker. The low-pass settled to approximately 742 Hz; the clear view used 20 kHz. Output audio remained measurable. Stop reset playback time to zero and silenced the effect tails. The emitter's Earth orbit was checked at radius 4.9 scene units.

The final sky uses only photographic stars, with zero Points/Sprite objects reported. Earth visually occludes the sky completely. The response map identifies 2201 isolated bright photographic regions; it supplies no new star geometry. The previous procedural dust volume is absent from the runtime.

Two fixed-camera captures with **T disabling shimmer** had exactly zero changed pixels in a 233760-pixel sky-only strip. Two captures with shimmer enabled showed 1224 pixels changing by more than 8/255 in a channel, 439 red-minus-blue changes greater than 8/255, and a maximum channel change of 38/255. Most background pixels remained unchanged. This verifies the requested visible effect without blanket texture noise; it is not a measurement of real stellar variability. `scripts/compare-sky-captures.mjs` reproduces the image comparison from the local captures.

The standalone HTML guide was inspected in the browser. Exploration/music tables were readable, navigation links reached their sections, and both research images loaded at their expected dimensions.

## Practical limits

Ring and planetary shadows are analytic approximations for spherical occluders and a finite circular star. The rings use optical depth and a finite light-disc sample pattern rather than tracing individual ice particles. The optional shimmer is a bounded atmospheric observing approximation; the stable mode preserves the photographic space sky. Neither uses measured real-time stellar variations. Orbit sizes, spacecraft scale, moon sizes, and periods are illustrative. Audio occlusion is a cinematic effect based on solid globe geometry.

The GitHub repository includes the runnable graphics, both official Windows runtimes, readable source, and offline instructions. **All songs are excluded from Git** and preserved locally; the committed Audio folder contains only its README. Large acquisition originals remain locally in `original-assets/` and are also excluded. Previous ZIP exports and checksum sidecars were removed.

`scripts/smoke-project.mjs` launches a standalone repository copy using its included runtime, without npm install or dependency caches. It checks the scene, illustrated guide, local engine/shaders, 16K/8K imagery, spacecraft model, playlist, and server HTTP handling. With local songs present it verifies byte-range streaming; `--no-audio` additionally requires an empty playlist for the public copy. A fresh copy of the staged public files passed with zero songs and no dependency installation. README and tutorial screenshots are actual browser captures, stored in `docs/screenshots/`; the generated local guide includes them.
