# Hidden music player

Music comes from the Hubble satellite orbiting Earth. Headphones make its direction easier to hear. The music mode has no visible menu, keeping the scene clear.

## Play your first song

1. Launch PLansi_xi and let the scene finish loading.
2. **Press the middle mouse button** (click the wheel), or press **M**.
3. Put a supported song in **Audio/** if this is a new repository download.
4. **Short left-click** to play the first available song.
5. Roll the wheel up or down to adjust volume.
6. Middle-click again, or press M, to leave music mode. Playback continues while you explore.

To stop, enter music mode again and short right-click. This stops playback, rewinds the song, and silences the reverb/echo output.

## Controls inside music mode

| Mouse                          | Action                                 | Keyboard alternative      |
| ------------------------------ | -------------------------------------- | ------------------------- |
| Short left click               | Play the current song                  | Space toggles play/stop   |
| Short right click              | Stop and rewind                        | Space toggles play/stop   |
| Hold left for at least 650 ms  | Next song                              | Right arrow               |
| Hold right for at least 650 ms | Previous song                          | Left arrow                |
| Wheel up / down                | Increase / decrease volume             | Up / down arrow, 5% steps |
| Middle click                   | Exit music mode; keep playback running | M or Escape               |

Each hold changes a track once. Releasing it does not also play/stop or select a planet. Switching songs keeps playing if playback was active; if stopped, it selects the track ready for your next play click. The playlist wraps at either end and advances when a song finishes. Volume starts at 60% and is bounded from 0% to 100%.

**While music mode is active, camera clicks/dragging and animation-wheel controls are suspended.** Exit with middle-click or M to restore them. Music playback speed is independent of the animation speed.

## Add and organize songs

Put files directly in the project’s **`Audio`** folder, beside `dist` and `scripts`. Subfolders are not scanned. MP3, WAV, OGG, Opus, M4A, AAC, and FLAC filenames are accepted; their codecs must also be supported by your browser. PCM WAV and ordinary MP3 are straightforward choices.

The GitHub repository contains **no songs**. Your existing local `Words before sleep.wav` and `The water answers.wav` stay on your computer. A file named `Words before sleep` is prioritized when present. Other songs are sorted by filename, including numeric order. Prefix filenames with `01`, `02`, and so on if you want a particular order after that first track. Audio files are ignored by Git automatically; only this folder's README is committed.

The playlist refreshes on entering music mode and changing tracks, so adding a song does not require restarting the server. To refresh after adding files, exit and re-enter music mode. Avoid renaming or removing a file while it is playing; stop first and refresh afterwards. Playback streams from the local server, with seeking byte ranges, and contacts no external music service. Songs are excluded from the GitHub copy. User music retains its owner's rights.

## Spatial sound

The camera is the listener and Hubble is the source. Stereo HRTF positioning, gentle distance attenuation, convolution reverb, and a filtered echo create the requested spacious effect. An intervening planet or moon reduces brightness and volume smoothly. Move the camera or wait for Hubble's orbit to clear the obstacle to hear the difference.

This represents cinematic radio-style playback. Sound itself cannot propagate through vacuum. The effects are a listening treatment, independent of the scientific sky rendering.

## Troubleshooting

- **No sound:** enter music mode and perform a real short left-click. Browsers require a user gesture to start audio. Check system/browser volume and increase player volume with the wheel.
- **Quiet, bass-heavy music:** a globe may obstruct Hubble. Select Hubble with **5** outside music mode to inspect the source, or return to the system and rotate.
- **No songs:** confirm the files are directly inside `Audio` in the project folder, then re-enter music mode.
- **One file fails:** try PCM WAV or MP3. A supported extension does not guarantee that every codec inside it can be decoded. Browser developer-console warnings contain the playback error.
- **Camera controls seem broken:** middle-click or press M to exit music mode.
- **Closing a browser tab stops music:** playback belongs to that tab. Keep it open while listening.
