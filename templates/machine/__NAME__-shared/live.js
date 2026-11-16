// The machine as a page you drive: the film's machine and overlay in real time. View and cutaway buttons, pause, the
// speed slider, an orbit you drag, a zoom on the wheel, keys 1-4 for the views, space to pause, H to hide the overlay.
// Left alone it plays the film's script as an auto tour with the operator's cursor, looped; any click, drag, wheel or
// key hands control to the visitor, IDLE seconds of quiet hands it back.
import {warmComposer} from '3dmechanica-kit/warm.js';
import {CAMS, createConsole, CUTS, RPM_MAX, RPM_MIN} from './console.js';
import {camAt, camName, camSince, cutAt, DURATION, makeConsoleFrame, makeCursor, PLAY, rpmAt, VIEW_FN} from './film.js';
import {createStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
// quality tiers: the page steps down a tier when frames run slow (test on an integrated GPU)
const TIERS = [
  {samples: 4, shadow: 2048, pr: 2},
  {samples: 2, shadow: 1024, pr: 1.5},
  {samples: 0, shadow: 512, pr: 1},
];

const CSS = `
html,body{background:#eceef0;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab;width:${W}px!important;height:${H}px!important}
#gl.drag{cursor:grabbing}
.tb,.hit{pointer-events:auto;cursor:pointer}
.hit.ew{position:absolute;cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:40px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;height:26px;padding:0 14px;border:1px solid #e1e3e6;background:rgba(255,255,255,.95);font:600 11px Inter,sans-serif;letter-spacing:1.3px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:7px;height:7px;border-radius:50%;background:#d6182b}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
`;

export function runLive() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createStage({canvas});
  const ui = createConsole(app);
  const tourCursor = makeCursor(ui);
  const frameConsole = makeConsoleFrame(ui, st);

  let tier = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700 ? 2 : 0;
  let scale = 1;
  const fit = () => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    const {pr, ...q} = TIERS[tier];
    st.setQuality(q);
    fit();
  };
  applyTier();
  addEventListener('resize', fit);

  const chip = document.createElement('div');
  chip.className = 'tourchip';
  ui.root.appendChild(chip);

  // ------------------------------------------------------------ state
  let T = 0;
  let deg = 30;
  let rpm = rpmAt(0);
  let rpmTarget = rpm;
  let paused = false;
  let view = CAMS[0];
  let viewAt = 0;
  let cut = 'solid';
  let cutAtT = 0;
  let hidden = false;
  const off = {az: 0, el: 0, k: 1};
  const cam = {...VIEW_FN[view](0)};
  let ring = {t: -9, x: 0, y: 0};
  const pulse = (k) => {
    const [x, y] = ui.spots[k];
    ring = {t: T, x, y};
  };

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0};
  let lastInput = 0;
  const startTour = () => {
    Object.assign(AP, {on: true, t0: T});
    paused = false;
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    const cyc = (T - AP.t0) % DURATION;
    view = camName(cyc);
    viewAt = T - camSince(cyc);
  };
  chip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    lastInput = T;
    if (AP.on) takeOver();
    else startTour();
  });
  addEventListener('pointerdown', (e) => e.target !== chip && takeOver());

  // ------------------------------------------------------------ controls
  const setView = (v) => {
    view = v;
    viewAt = T;
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  for (const k of CAMS) ui.btn[k].addEventListener('click', () => (takeOver(), pulse(k), setView(k)));
  for (const k of CUTS) ui.btn[k].addEventListener('click', () => (takeOver(), pulse(k), (cut = k), (cutAtT = T)));
  ui.btn.pause.addEventListener('click', () => (takeOver(), pulse('pause'), (paused = !paused)));
  {
    const [x0, y] = ui.knobAt(0);
    const [x1] = ui.knobAt(1);
    const d = document.createElement('div');
    d.className = 'hit ew';
    Object.assign(d.style, {left: `${x0 - 12}px`, top: `${y - 14}px`, width: `${x1 - x0 + 24}px`, height: '28px'});
    const move = (e) => {
      const r = app.getBoundingClientRect();
      const k = clamp(((e.clientX - r.left) / scale - x0) / (x1 - x0), 0, 1);
      rpmTarget = RPM_MIN + k * (RPM_MAX - RPM_MIN);
      lastInput = T;
    };
    d.addEventListener('pointerdown', (e) => {
      takeOver();
      move(e);
      const up = () => (removeEventListener('pointermove', move), removeEventListener('pointerup', up));
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    });
    ui.root.appendChild(d);
  }
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    takeOver();
    if (CAMS[Number(key) - 1]) setView(CAMS[Number(key) - 1]);
    else if (key === ' ') paused = !paused;
    else if (key === 'h') hidden = !hidden;
    else return;
    e.preventDefault();
  });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    off.az += ((e.clientX - drag.x) / scale) * 0.3;
    off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -20, 60);
    drag = {x: e.clientX, y: e.clientY};
    lastInput = T;
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    takeOver();
    off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.5, 2);
  }, {passive: false});

  // ------------------------------------------------------------ the frame
  startTour();
  let last = performance.now();
  const perf = {n: 0, sum: 0, age: 0};
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    // step down a tier after a stretch of slow frames
    perf.age += dt;
    if (tier < TIERS.length - 1 && perf.age > 1) {
      perf.sum += dt;
      if (++perf.n >= 30) {
        if (perf.sum / perf.n > 0.022) {
          tier++;
          applyTier();
          perf.age = 0;
        }
        perf.n = 0;
        perf.sum = 0;
      }
    }

    let tgt;
    let cursor;
    if (AP.on) {
      const cyc = (T - AP.t0) % DURATION;
      view = camName(cyc);
      rpmTarget = rpmAt(cyc);
      const c = cutAt(cyc);
      if (c !== cut) [cut, cutAtT] = [c, T];
      tgt = camAt(cyc);
      cursor = tourCursor(cyc);
    } else {
      if (T - lastInput > IDLE) startTour();
      tgt = VIEW_FN[view](T - viewAt);
      tgt.az += off.az;
      tgt.el = clamp(tgt.el + off.el, -10, 80);
      tgt.d *= off.k;
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
    }
    rpm += (rpmTarget - rpm) * (1 - Math.exp(-dt / 0.35));
    if (!paused) deg += ((rpm / 60) * 360 * dt) / PLAY;

    // the camera eases toward its target: the tour's moves pass through, a click glides
    const k = 1 - Math.exp(-dt / (AP.on ? 0.12 : 0.4));
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd', 'sx', 'sy']) cam[key] += (tgt[key] - cam[key]) * k;
    st.frame(deg, {...cam, az: cam.az * D2R, el: cam.el * D2R}, {cut});
    ui.root.style.display = hidden ? 'none' : '';
    frameConsole({deg, rpm, cam: view, cut, paused, since: T - cutAtT, cursor});
    if (chip.classList.contains('on') !== AP.on || !chip.firstChild) {
      chip.classList.toggle('on', AP.on);
      chip.innerHTML = AP.on ? '<i></i>AUTO TOUR · CLICK TO TAKE OVER' : '▶ RESUME TOUR';
    }
    requestAnimationFrame(frame);
  };
  // every shader compiles at once before the first frame (kit/warm.js), so the page never freezes on first draw
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
  window.LIVE = {st, startTour, takeOver};
}
