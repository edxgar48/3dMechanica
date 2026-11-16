---
name: 3dmechanica
description: Build an interactive 3D simulator of a real machine or mechanism (an engine, a landing gear, a walking linkage, a pump, a gearbox) as one offline HTML page people can take apart, with live panels driven by the same model that moves the parts, a button for every subsystem, cutaways, camera views and an auto tour that hands control to the visitor; then record it frame by frame to a 60 fps video with a synced procedural score. Use when someone asks how a machine works, wants a "visual explainer", a "simulator", a "cutaway", an "exploded view" or an "interactive 3D lesson", or wants a 3D object shown working rather than described.
---

# 3DMechanica

One machine, one page. The visitor sees the thing run, presses a button, and the part doing the work opens up while the gauges around it read the real numbers. Left alone, the page tours itself with a cursor. The same code records a film of the tour, frame by frame, with a score built on the same timeline.

`$SKILL_DIR` below stands for the absolute path of the folder this file lives in: write that path into each command, in quotes. Every command is a single program call, so it runs as written in bash, zsh, cmd and PowerShell. `python` is `python3` on macOS and Linux. Builds and renders go to `./3dmechanica-out` of the folder you run from.

## First run

```
npm install --prefix "$SKILL_DIR"
node "$SKILL_DIR/node_modules/playwright/cli.js" install chromium
```

The pages need nothing else. The video needs `ffmpeg` on PATH and the score needs Python 3 (standard library only). Set `FFMPEG`, `PYTHON` or `CHROMIUM` to point at other binaries.

Then, and whenever a build or a capture fails for a reason outside the code, run `node "$SKILL_DIR/doctor.mjs"`. It checks Node, the packages, Chromium and the GPU it gets (a software renderer makes captures crawl), ffmpeg and Python, and says how to fix each. A FAIL line blocks the pages; a warn line only blocks video or sound, so say which output is missing instead of stopping.

## The 3 examples

Build one, open the HTML, press buttons. Read the closest one when you start a new machine; start the machine itself from `new-machine.mjs` (below).

| | The machine | What drives it | Worth stealing |
|---|---|---|---|
| `v8-*` | A cross-plane V8 with glass liners: the charge burns inside the cylinder you track, valves lift on their cams, 8 pistons move from the exact slider-crank. | Crank angle. Firing order 1-8-4-3-6-5-7-2, a chamber pressure model for the indicator diagram. | Cutaway modes (glass, section, solid), the firing order as a cylinder picker, live charts synced to the crank. |
| `cessna-*` | The Cessna 337 main landing gear folding into the airframe on takeoff and dropping on landing. | Stroke 0..1: a 201 mm rack turns a 32-tooth pinion (module 4 mm) through exactly 180°. | One degree of freedom posing a whole mechanism, flight phases as functions of time, a runway that rolls under the model. |
| `strandbeest-*` | Theo Jansen's Strandbeest, 20 legs on one crankshaft, walking broadside over sand. | Wind. The crank speed is integrated from it; every joint follows by circle intersection from Jansen's 11 link lengths. | An exact linkage solver in 67 lines, instanced tubes, foot traces, a contact chart of all 20 feet. |

Each comes in 3 folders: `<name>-shared/` holds the machine, `<name>-film/` the recorded tour, `<name>-live/` the page you drive.

```
node "$SKILL_DIR/sims/build.mjs" v8-live          # → 3dmechanica-out/dist/v8-live.html, offline, ~800 KB
node "$SKILL_DIR/sims/build.mjs"                  # all 6
```

## How a machine is built

One folder per machine, split by job. The examples follow this exactly:

| File | Job |
|---|---|
| `kin.js` / `gear.js` / `jansen.js` | The math. Real dimensions in real units, one input (crank angle, stroke, wind) and every pose and readout as a function of it. No three.js in here. |
| `engine.js` / `gear.js` / `beast.js` | The geometry, built from code: lathed parts, tubes, instanced links. `update(input)` poses it. |
| `stage.js` | Studio, lights, shadows, post (GTAO, bloom). `frame(state, cam)` draws one frame. |
| `console.js` | The overlay: fixed 1600 x 900 CSS layout of panels, charts, toggles, callouts with leaders. `update(state)` redraws it from the frame's state. |
| `film.js` | A `SCRIPT` of operator moves (views, isolate, cutaway, throttle) and `render(t)` as a pure function of time. |
| `live.js` | The same machine in real time: buttons, sliders, orbit, zoom, keys. With no input it plays `film.js`'s script as an auto tour with a cursor; any click, drag, wheel or key hands control over, 25 s of quiet hands it back. |
| `score.py` | The sound on the film's timeline. |

## Starting a new machine

```
node "$SKILL_DIR/new-machine.mjs" gear-pump --title "Gear Pump"     # → ./gear-pump-shared, -film, -live
node "$SKILL_DIR/sims/build.mjs" ./gear-pump-live ./gear-pump-film
```

This writes a complete, small machine in the current folder (`--dir` for another): a single-cylinder slider-crank with the exact kinematics, every file in the table above (`machine.js` is the geometry), a timeline, an auto tour and a score. It builds, captures and scores as it is, so you start from something that works and change one file at a time: `kin.js` first (the real numbers and the math for your mechanism), then `machine.js`, `console.js`, the timeline, `score.py`. Keep the wiring: one input, one timeline, every readout from the function that poses the parts. When your machine is close to one of the 3 examples, read that example for the harder parts (cutaways with section caps, instanced links, a flight model) and borrow from it.

When you change the skill itself (the kit, `build.mjs`, `capture.mjs`, `sfx/`, an example or the template), run `npm --prefix "$SKILL_DIR" test` before saying it works.

Outside `SKILL_DIR` the kit is imported by name (`import {runSim} from '3dmechanica-kit/runtime.js'`), and a build copies the film's timeline next to the page, so `--stills beats` finds it without `--timeline`.

## Rules that decide whether it works

1. **Start from a reference, never from imagination.** A photo, a cutaway drawing from a manual, a clip of the real thing. Build against it and compare frame by frame. Machines invented from a sentence come out generic every time; the same model rebuilds a real one closely when it has something to match.
2. **Real numbers, one source.** Get the real dimensions first (bore, stroke, tooth count, link lengths). Every gauge, chart and label reads from the same function that poses the parts, so nothing on screen can disagree with the motion. Check one by hand: in the Cessna, 32 teeth × 4 mm module is a 128 mm pitch diameter, and half its circumference is the 201 mm stroke.
3. **One input drives everything.** Pose from the crank angle, the stroke or the wind. Nothing is keyframed by hand, so the film, the live page and the score never drift.
4. **The part doing the work opens up.** Isolate it, cut it, x-ray it. A camera that goes inside is worth more than ten orbits.
5. **Dark studio, one accent.** Every page uses the dark theme: a near-black backdrop (`theme: 'dark'` in the film's DEFAULTS), panels in `rgba(21,24,29,.92)` with light ink, unlit controls filled with a `paper` colour, lit ones in ink or the accent. The accent marks the thing that is changing. Parts must stand off the dark ground: no near-black materials (lift them to graphite, around `#4b515a`), white or light parts and bright metals read best, and a translucent shell (a ghost, a glass) is tinted and kept faint or it turns into grey fog. Keep the environment map bright so metal still catches light; shadows go black at about 0.55.
6. **Pick the camera for the mechanism.** A planar linkage seen face-on collapses into a lattice; a 3/4 view along the spine keeps every leg readable.
7. **Fix collisions with a number.** When a part pokes through another, scale or move it in the parameter block. Never hide it with the camera.

## Live page rules

- **Test on an integrated GPU.** A page that runs at 60 fps on a desktop card can drop to 15 fps on a laptop's built-in one. The examples carry quality tiers (`TIERS` in `live.js`): no AO, lower pixel ratio, smaller shadow maps, panels redrawn every other frame. Find the expensive shader first: a displacement computed 5 times per vertex costs more than every tier together.
- **Warm the shaders.** `kit/warm.js` compiles every program in parallel before the first frame, so the page never freezes on first draw.
- **Keep the page under 1 MB.** Link crawlers (X, Slack) read the share card from the HTML and give up on a 15 MB page. Big models go out as files next to the page: `build.json` → `{"external": {"heavy.glb": "light.glb"}}`.

## render(t) contract

```js
import {runSim} from '../kit/runtime.js';

const DEFAULTS = {duration: 20, fps: 60, hud: {enabled: false}, director: {enabled: false}};

runSim(DEFAULTS, async ({cfg, canvas, capture}) => {
  // build the scene, precompute anything stateful
  return {render(t) { /* draw frame t from scratch */ return {}; }, resize() {}};
});
```

- `render(t)` is pure: no `Math.random` (use `rng(seed)` from `kit/util.js` at setup), no `Date`, no state carried between frames. Capture calls it at arbitrary times.
- Anything that moves by its own rules (agents, particles) is simulated once at load into typed arrays; `render` only reads them. A quantity integrated over time (the Strandbeest's crank under a changing wind) is integrated in closed form or tabulated at load.
- Every beat goes into `<name>-film/timeline.json` in seconds, and nowhere else. The operator's moves are its `script`, each a time plus what it does: `{"duration": 26, "script": [{"t": 0, "cam": "open"}, {"t": 12.1, "rpm": [700, 2400, 1.4]}, ...]}`. `film.js` imports it (`import TIMELINE from '../<name>-film/timeline.json'`, `SCRIPT = TIMELINE.script`), the live tour plays that SCRIPT, the score picks its accents from it with `moves(tl, "cam", after=0)`, and `--stills beats`, `sheet.mjs` and `wave.mjs` draw a beat at every `t`. Any other timing a sound needs (a label cadence) goes in the same file. Move a beat there and everything follows.
- Frame 0 is the thumbnail. It must already show the machine.

## Commands

```
node "$SKILL_DIR/sims/build.mjs" v8-film
node "$SKILL_DIR/sims/capture.mjs" v8-film --size 1600x900 --dpr 1.2 --stills beats --cols 4 --out 3dmechanica-out/v8-beats.png
node "$SKILL_DIR/sims/capture.mjs" v8-film --size 1600x900 --dpr 1.2 --still 12.5 --out 3dmechanica-out/v8-12.5.png
node "$SKILL_DIR/sims/capture.mjs" v8-film --size 1600x900 --dpr 1.2 --out 3dmechanica-out/v8-silent.mp4
python "$SKILL_DIR/run_sfx.py" "$SKILL_DIR/sims/v8-shared/score.py"
ffmpeg -y -i 3dmechanica-out/v8-silent.mp4 -i 3dmechanica-out/v8-score.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart 3dmechanica-out/v8.mp4
node "$SKILL_DIR/wave.mjs" 3dmechanica-out/v8.mp4 --timeline "$SKILL_DIR/sims/v8-film/timeline.json"
```

`--size` is the CSS layout and `--dpr` multiplies it: 1600 x 900 at 1.2 gives 1920 x 1080. Capture prints the GPU it got; a software renderer means the GPU flags in `paths.mjs` did not take.

## Review loop

You cannot watch the video; you can look at frames. Never report a machine as done without reading sheets of the current render.

1. `--stills beats`: one tile per timeline beat, 0.3 s after it, each labelled `t=`.
2. Read every tile against the checklist below.
3. Zoom in: `--stills every:0.2 --from A --to B` for a transition, `--still T` for one full frame.
4. Fix, rebuild, go back to 1. Stop when a full pass finds nothing.
5. Final: `node "$SKILL_DIR/sheet.mjs" --video <final.mp4> --timeline <timeline.json>` and read that too: it shows what the encoder wrote.

Checklist:

- **The mechanism.** Every part that should touch touches; nothing passes through anything; the numbers on the panels match the pose.
- **Composition.** One focal point per frame. Nothing important within 60 px of an edge. Labels never cover the part they name.
- **Type.** Nothing clipped. The key readout reads at phone width.
- **3D.** Bloom eats detail: keep emissive layers under 1.0. Near-white surfaces blow out. Glossy metal under a low light streaks: roughness ≥ 0.45 and envMapIntensity ≈ 0.5 on big surfaces.
- **Timing.** Each state holds long enough to read: 1 s for a short phrase plus 0.25 s per word beyond three.

## three.js traps the examples already hit

- `smoothstep(a, b, x)` with `a > b` returns 0 on Windows (ANGLE/D3D). Write `1.0 - smoothstep(b, a, x)`.
- A `ShadowMaterial` or a decal a fraction of a millimetre above the floor loses the depth test inside a post-processing render target. Give it `polygonOffset`.
- A quad laid into the ground with a mirrored mapping gets culled as a back face. Use `DoubleSide`.
- One NaN pixel blacks out the whole frame through bloom. Clamp every `pow()` base in a shader.
- GTAO on a clipped (cutaway) model needs the same clipping planes on `gtao.normalMaterial`, or the cut half returns as a pale ghost.

## Sound

`sfx/` synthesises every sound in pure Python (48 kHz, reproducible) and reads the film's timeline, so sound cannot drift out of sync. `python "$SKILL_DIR/run_sfx.py" --list` shows the generators. `sample()` adds the recorded CC0 sounds in `sfx/samples/`. `sfx/score_kit.py` has the beds and accents the 3 scores use: a chord bed, a soft thud per power stroke, a motor, air under a drag.

- Every time comes from the timeline, never a typed number: `score(mix, tl)` reads `tl["script"]` through `moves(tl, *keys, after=None)` from `score_kit`. A model the film integrates (the crank under the throttle or the wind) is mirrored in Python, but its event comes from the script.
- Mastering is automatic: −14 LUFS, true peak ≤ −2 dBFS.
- Accent, never narrate: continuous motion stays silent. One key for every tonal sound.

## Taste, with numbers

- Easing: entrances `cubic-bezier(0.16, 1, 0.3, 1)`, exits `cubic-bezier(0.6, 0, 0.9, 0.35)` at half the entrance's length, state to state `cubic-bezier(0.65, 0, 0.35, 1)`. Linear only for continuous motion.
- The machine fills 60-70% of its viewport. Labels never under 34 px on a 1080 canvas.
- One accent, and it means something: the part that is working right now.
- Nothing dead-still: one element always alive.

## Credits

3DMechanica is based on [elvarofficial/teardown](https://github.com/elvarofficial/teardown) (MIT). The kit, frame capture, sfx engine and review rules come from [whaleyxbt/claude-motion](https://github.com/whaleyxbt/claude-motion) (MIT). The recorded samples are CC0 from Freesound, trimmed by [Barty-Bart/motion-graphics](https://github.com/Barty-Bart/motion-graphics) (MIT); sources in `sfx/samples/SOURCES.md`.
