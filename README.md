# PLansi_xi

A local Three.js space explorer with photographic planetary textures, a real **16K Milky Way panorama**, continuous camera flights, and music transmitted from an orbiting NASA Hubble model. The scene stays clear of labels and control panels.

**[Live website — o0space0o.app](https://o0space0o.app/)**

Explore online, or follow the steps below to run locally and play your own songs from the **Audio/** folder.

![Earth and its atmosphere in PLansi_xi](docs/screenshots/earth.jpg)

**[Step-by-step tutorial](docs/tutorial.md)** · **[All website controls](docs/website-guide.md)** · **[Music player](docs/music-player.md)** · **[Imagery and credits](docs/credits.md)**

## Start in three steps

1. Download or clone this repository, keeping the complete folder intact.
2. On **Windows 10/11 x64 or ARM64**, double-click **Start PLansi_xi.cmd**.
3. Keep the terminal open. The browser opens at **<http://127.0.0.1:4173>**.

The repository includes local graphics assets, Three.js modules, and verified official Node.js 24.21.0 LTS Windows runtimes. No installation, account, API key, or internet connection is needed to run the complete Windows checkout. Use a current browser with **hardware acceleration enabled** and wait for the loading bar to disappear.

On macOS or Linux, install Node.js 24 or newer, run `node scripts/serve.mjs`, and open the printed address. **Guide.html** opens offline; press **H** in the scene to open the website guide. Close the terminal or press **Ctrl+C** there to stop.

## Explore

| Input                                | What happens                                              |
| ------------------------------------ | --------------------------------------------------------- |
| Left-click a planet, moon, or Hubble | Fly smoothly to it and follow its orbit                   |
| Right-click                          | Fly back to the whole system                              |
| Left-drag                            | Rotate freely, including repeated turns through the poles |
| Wheel up / down **over an object**   | Speed up / slow down only that object's orbit and spin    |
| Wheel up / down **over empty sky**   | Speed up / slow down the photographic background shimmer  |
| 1 / 2 / 3 / 4 / 5                    | Visit Earth / Luna / Kepler X / Aurelia / Hubble          |
| Escape                               | Return to the system                                      |
| T                                    | Toggle photographic shimmer / steady space sky            |
| H                                    | Open the instructions                                     |
| Middle mouse click or M              | Enter or leave hidden music mode                          |

Every target starts at **1×**. Enough downward scrolling pauses that target; scrolling upward resumes it. Rates are bounded at **80×**. Pausing Earth still lets Luna and Hubble orbit it; a paused moon is still carried through space by its moving parent. The wheel does not zoom or alter camera flight duration or music playback speed. Reloading restores all defaults.

![Aurelia and its banded rings](docs/screenshots/aurelia.jpg)

## Play music from Hubble

Press the **middle mouse button** once. There is no visible menu; the mouse now controls music:

| Input inside music mode | Action                               |
| ----------------------- | ------------------------------------ |
| Short left click        | Play                                 |
| Short right click       | Stop and rewind                      |
| Hold left for 650 ms    | Next track                           |
| Hold right for 650 ms   | Previous track                       |
| Wheel up / down         | Raise / lower volume                 |
| Middle click again      | Leave music mode; playback continues |

Put your songs directly in **Audio/**. **Songs are kept local and excluded from this GitHub repository.** Re-enter music mode to refresh the playlist. A file named `Words before sleep` plays first when present, then other supported files sort by filename. MP3, WAV, OGG, Opus, M4A, AAC, and FLAC filenames are supported; decoding depends on your browser. Tracks wrap and advance automatically when a song finishes. With no songs added, the orbital explorer still runs normally.

**Keyboard:** M toggles the mode; inside it, Space plays/stops, Left/Right change tracks, Up/Down change volume, and Escape exits. Exit music mode before selecting worlds or rotating the camera.

Headphones reveal Hubble's position, spacious reverb, echo, and smooth muffling when a planet blocks the source. This is a cinematic radio effect. [The music tutorial](docs/music-player.md) explains the playlist and troubleshooting.

![NASA Hubble spacecraft orbiting Earth](docs/screenshots/hubble.jpg)

## Highest graphics by default

- **16384 × 8192 photographic sky**, prepared from a real 40000 × 20000 NOIRLab image.
- **8192 × 4096 cloud and night-light maps**, NASA Earth surface **5400 × 2700**, and NASA lunar color **4096 × 2048**.
- Native display pixel density, GPU-supported multisample antialiasing, HDR rendering, and restrained bloom. **No automatic resolution reduction.**
- Surface relief, ocean reflections, clouds, atmospheric rims, finite-disc eclipses, and ring shadows following the visible bands and gaps.
- NASA's textured Hubble GLB with metallic reflections, self-shadowing, Earth eclipses, and Earthshine.

Only a GPU texture limit below 16384 selects the 8K sky automatically. For a smaller memory footprint, explicitly open **<http://127.0.0.1:4173/?quality=8k>**; this also selects 4K cloud/night maps. The default favors detail, so the largest photographic texture can take time to load.

**Background stars are photographed, not invented.** Optional smooth brightness/color gains affect only existing isolated bright photographic regions, with no added star particles, moving dust sheet, or blanket flicker. Rapid night-sky twinkling is an atmospheric effect; interstellar dust extinction is already recorded in the photo. Press **T** for the steadier view expected from space. [Real-image comparisons and scientific explanation](docs/starlight-science.md).

Earth and Luna use real imagery. **Kepler X and Aurelia are imagined worlds**; Kepler's generated surface is 1774 × 887. The orbital arrangement, sizes, and distances are illustrative, and the application uses prescribed circular orbits rather than an N-body physics calculation. It is a photographic visual simulation, not a measured astronomical system. Rendering runs on the GPU through WebGL 2.

## Develop and verify

With Node.js installed:

```sh
git clone https://github.com/o0space0o/PLansi_xi.git
cd PLansi_xi
npm ci
npm start
```

```sh
npm run check
npm test
npm run format:check
npm run docs
```

`dist/` contains readable browser source and prepared assets; there is no application build step. `scripts/` contains the local server, asset preparation, and checks. `docs/` contains the tutorial, music guide, scientific references, [architecture](docs/architecture.md), and [validation notes](docs/validation.md). Songs, local Firebase configuration and deployment caches, large acquisition originals, local QA captures, dependency caches, and ZIP exports are excluded from Git. Browser graphics and Windows runtimes are included.

The server binds to **127.0.0.1** and serves the browser app and allowlisted music files. Opening `dist/index.html` directly is unsupported; use the launcher or local server. If another app uses port 4173, run `node scripts/serve.mjs --port 4174` and visit the address it prints.

The [GitHub validation workflow](.github/workflows/validate.yml) runs the same checks on Windows after updates to `main`, including verification that the public copy contains no songs.

## Current changes

- Project renamed to **PLansi_xi** throughout the application, launcher, package, diagnostics, and documentation.
- Scroll speed now targets the object under the pointer, with independent body and sky clocks.
- Highest available textures and native resolution are the defaults; postprocessing has multisample antialiasing.
- Illustrated tutorial, full music instructions, and reusable technical documentation included.
- Previous ZIP exports removed. This repository is the shareable project reference.

Imagery, engine, portable runtime, and research-image attributions are listed in [credits](docs/credits.md). Music retains its owner's rights; visual asset licenses do not grant rights to the songs.
