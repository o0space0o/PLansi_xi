# Using PLansi_xi

## Black hole and distant objects

Press **B** or **6** to approach the black hole orbiting Kepler X. **G**, **N** and **C**, or clicking the visible object, visit the spiral galaxy, nebula and molecular cloud in the main universe. Approaches stay about 4.8 radii away, farther on portrait screens. Right-click/Escape shows the planetary overview. There are no labels or visible controls. [Optics, 3D matter and memory](space-objects.md).

## Start and stop

Keep the complete downloaded/cloned repository together. On Windows 10/11 x64 or ARM64, double-click **Start PLansi_xi.cmd**. It chooses the included official Node.js runtime, starts a loopback-only server, and opens your browser. Keep the terminal open. If necessary, visit <http://127.0.0.1:4173> yourself. Close the terminal or press **Ctrl+C** there to stop.

On macOS/Linux, install Node.js 24 or newer, run `node scripts/serve.mjs`, and open the printed address. The checked-in browser modules and prepared assets need no build. For development, use `npm ci` to install the pinned tooling and regenerate the vendor bundle.

[Follow the illustrated tutorial](tutorial.md) for a first visit. **Guide.html** contains the documentation offline. Press **H** in the scene to open the online local guide.

## Explore without a visible interface

| Input                                              | Action                                            |
| -------------------------------------------------- | ------------------------------------------------- |
| Left-click a planet, moon, Hubble, galaxy or cloud | Smooth flight to a safe viewing distance          |
| Right-click                                        | Smooth return to the entire system                |
| Left-drag                                          | Rotate freely, through unlimited complete turns   |
| Wheel up / down over a body                        | Accelerate / slow its own orbit and spin          |
| Wheel up / down over empty sky                     | Accelerate / slow the background shimmer          |
| 1 / 2 / 3 / 4 / 5                                  | Select Earth / Luna / Kepler X / Aurelia / Hubble |
| B or 6                                             | Visit the orbiting black hole                     |
| G / N / C                                          | Visit the galaxy / nebula / molecular cloud       |
| Escape                                             | Return to the system overview                     |
| T                                                  | Switch photographic shimmer / steady space view   |
| H                                                  | Open instructions in a separate tab               |
| Middle button or M                                 | Enter or exit hidden music mode                   |

## Point to control time

Place the pointer over the visible object you want to change, then scroll. Each planet, moon, and Hubble has its own clock. A planet's cloud rotation follows its clock too. The background has a separate shimmer clock; point away from the objects to change it. Rings belong to Aurelia, so scrolling over a ring changes Aurelia's clock.

Every clock starts at 1×, with body motion based on 0.05 simulated days per real second. Scroll up to accelerate, down to slow, and far enough down to pause that target. Scroll up again to resume. The maximum is 80×. An Earth speed change does not change Luna or Hubble's orbit around Earth, although they still follow Earth's position. Likewise, a paused moon stays attached to its moving parent.

Camera journeys keep their normal duration, and music keeps its original playback speed. Inside **music mode**, the wheel controls volume instead. Exit music mode to select worlds and rotate again. [Music-player guide](music-player.md).

The wider approach leaves space around each world. Trackball rotation can roll the view upside down when crossing a pole. Reloading restores the overview, every speed to 1×, and shimmer enabled. No labels, orbit lines, or control panels appear.

## Graphics and background

The default live optimizer targets **60 FPS**. It adjusts render resolution, MSAA, bloom, spacecraft shadow quality, and photographic texture sizes using measured frame/CPU time, asynchronous GPU timings where available, approximate device memory, and estimated graphics allocations. It lowers quality when rendering stays slow and restores detail after sustained headroom. The maximum sky is a **16384 × 8192** NOIRLab photograph, prepared from its 40000 × 20000 original; smaller devices use prepared 8K/4K/2K versions. Browser memory hints are approximate and may be unavailable; free GPU memory cannot be read directly.

Use <http://127.0.0.1:4173/?quality=8k> to cap sky detail at 8K while keeping adaptation, <http://127.0.0.1:4173/?fps=30> for a 30 FPS target, or <http://127.0.0.1:4173/?quality=highest> for maximum initial detail with HD output and live memory protection. Volume resolution, ray samples and secondary effects follow the measured budget. Hidden tabs pause scene work; returning to the page resumes without treating the pause as poor performance.

The distant panorama is photographic. The galaxy and clouds are additional real 3D stellar populations and emissive density volumes with parallax in the same universe. The default subtle atmospheric shimmer changes light already photographed. Press **T** to use the steady photo expected from space. [The science reference](starlight-science.md) explains dust and twinkling using real observations. There is no texture-wide animation noise, blur, or moving dust wash.

Earth and Luna use NASA imagery; Hubble uses NASA's textured model. Kepler X and Aurelia are fictional. Sizes and orbits are arranged for viewing rather than a measured astronomical system or N-body calculation. [Full asset credits](credits.md).

## Common issues

| Symptom                                      | What to do                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Launcher cannot find its runtime             | Keep `runtime`, `dist`, `Audio`, and `scripts` beside the launcher; download the complete repository           |
| Blank or black scene                         | Enable browser hardware acceleration and reload; read any error shown                                          |
| Page does not open                           | Keep the terminal open and enter the printed local address                                                     |
| Slow rendering or low memory                 | Use the default adaptive mode; try `?fps=30` or cap detail with `?quality=8k`; close other graphics-heavy tabs |
| Wheel changes volume / camera does not react | Press M or middle-click to leave music mode                                                                    |
| Wrong object changes speed                   | Place the pointer directly over its visible surface, or its rings for Aurelia                                  |
| Music is quiet or muffled                    | Check volume and move to a clear line of sight to Hubble                                                       |
| A song does not play                         | Follow [music troubleshooting](music-player.md#troubleshooting)                                                |

If port 4173 is occupied, run `node scripts/serve.mjs --port 4174` using installed Node or the bundled architecture-specific executable, then use the new printed address. On Windows add `--open` to open the browser automatically.
