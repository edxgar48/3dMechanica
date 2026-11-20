// The motor as a page you drive: the film's motor and overlay in real time, with the same simulation (kin.js) stepped
// every frame. View, cutaway and drive-mode buttons, pause, the target, current and load sliders, an orbit you drag, a
// zoom on the wheel, keys 1-5 for the views, F/M/C for the modes, space to pause, H to hide the overlay. Left alone it
// plays the film's script as an auto tour with the operator's cursor, looped; any click, drag, wheel or key hands
// control to the visitor from the tour's exact state, IDLE seconds of quiet hands it back.
import {warmComposer} from '3dmechanica-kit/warm.js';
import {AMP_MAX, ANG, CAMS, createConsole, CUTS, G_MAX, MODES, TRACE_S} from './console.js';
import {camAt, camName, camSince, cutAt, DURATION, makeConsoleFrame, makeCursor, modeAt, SIM, targetAt, traceAt, VIEW_FN} from './film.js';
import {newState, readout, step} from './kin.js';
import {createStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const VMAX = 180; // command profile: deg/s
const AMAX = 900; // deg/s²
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const TIERS = [
  {samples: 4, shadow: 2048, pr: 2},
  {samples: 2, shadow: 1024, pr: 1.5},
  {samples: 0, shadow: 512, pr: 1},
];

const CSS = `
html,body{background:#0f1115;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab;width:${W}px!important;height:${H}px!important}
#gl.drag{cursor:grabbing}
.tb,.hit{pointer-events:auto;cursor:pointer}
.hit.ew{position:absolute;cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:40px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;height:26px;padding:0 14px;border:1px solid #2b3037;background:rgba(21,24,29,.92);color:#e7e9ec;font:600 11px Inter,sans-serif;letter-spacing:1.3px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:7px;height:7px;border-radius:50%;background:#ff7a2f}
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

  // ------------------------------------------------------------ state: the visitor's inputs and the motor's simulation
  let T = 0;
  const sim = newState();
  const inp = {target: 0, cmd: 0, vel: 0, mode: 'micro', imax: 0.9, grams: 150};
  let paused = false;
  let view = CAMS[0];
  let viewAt = 0;
  let cut = 'solid';
  const shell = {xray: 0, explode: 0};
  let hidden = false;
  const off = {az: 0, el: 0, k: 1};
  const cam = {...VIEW_FN[view](0)};
  let ring = {t: -9, x: 0, y: 0};
  const pulse = (k) => {
    const [x, y] = ui.spots[k];
    ring = {t: T, x, y};
  };
  // the phase trace: one sample every TRACE_S / 120 seconds
  const trace = [];
  let traceT = 0;

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
    // the visitor takes the motor exactly as the tour left it: its state, its inputs, its trace
    const cyc = (T - AP.t0) % DURATION;
    const row = SIM.rows[Math.min(SIM.rows.length - 1, Math.round(cyc * SIM.rate))];
    Object.assign(sim, row.state);
    Object.assign(inp, {target: targetAt(cyc), cmd: row.cmd, vel: 0, mode: row.mode, imax: row.imax, grams: row.mass * 1000});
    trace.length = 0;
    trace.push(...traceAt(cyc));
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
  for (const k of CUTS) ui.btn[k].addEventListener('click', () => (takeOver(), pulse(k), (cut = k)));
  for (const k of MODES) ui.btn[k].addEventListener('click', () => (takeOver(), pulse(k), (inp.mode = k)));
  ui.btn.pause.addEventListener('click', () => (takeOver(), pulse('pause'), (paused = !paused)));
  const slider = (knobAt, apply) => {
    const [x0, y] = knobAt(0);
    const [x1] = knobAt(1);
    const d = document.createElement('div');
    d.className = 'hit ew';
    Object.assign(d.style, {left: `${x0 - 12}px`, top: `${y - 14}px`, width: `${x1 - x0 + 24}px`, height: '28px'});
    const move = (e) => {
      const r = app.getBoundingClientRect();
      apply(clamp(((e.clientX - r.left) / scale - x0) / (x1 - x0), 0, 1));
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
  };
  slider(ui.angKnob, (k) => (inp.target = Math.round(ANG[0] + k * (ANG[1] - ANG[0]))));
  slider(ui.ampKnob, (k) => (inp.imax = k * AMP_MAX));
  slider(ui.loadKnob, (k) => (inp.grams = Math.round(k * G_MAX)));
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    takeOver();
    if (CAMS[Number(key) - 1]) setView(CAMS[Number(key) - 1]);
    else if (key === 'f') inp.mode = 'full';
    else if (key === 'm') inp.mode = 'micro';
    else if (key === 'c') inp.mode = 'foc';
    else if (key === 'arrowleft' || key === 'arrowright') inp.target = clamp(inp.target + (key === 'arrowleft' ? -15 : 15), ANG[0], ANG[1]);
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
    off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.4, 2);
  }, {passive: false});

  // the command follows the target under a speed and acceleration limit, like a motion controller's profile
  const profile = (dt) => {
    const d = inp.target - inp.cmd;
    const stopDist = (inp.vel * inp.vel) / (2 * AMAX);
    const want = Math.abs(d) < 1e-3 ? 0 : Math.sign(d) * (Math.abs(d) <= stopDist ? Math.sqrt(2 * AMAX * Math.abs(d)) : VMAX);
    inp.vel += clamp(want - inp.vel, -AMAX * dt, AMAX * dt);
    inp.cmd += inp.vel * dt;
    if (Math.abs(inp.target - inp.cmd) < 0.02 && Math.abs(inp.vel) < 5) {
      inp.cmd = inp.target;
      inp.vel = 0;
    }
  };

  // ------------------------------------------------------------ the frame
  startTour();
  let last = performance.now();
  const perf = {n: 0, sum: 0, age: 0};
  const frame = (now) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
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
    let since;
    let r;
    let tr;
    let ins;
    if (AP.on) {
      const cyc = (T - AP.t0) % DURATION;
      const row = SIM.at(cyc);
      view = camName(cyc);
      cut = cutAt(cyc);
      tgt = camAt(cyc);
      since = camSince(cyc);
      cursor = tourCursor(cyc);
      r = row;
      tr = traceAt(cyc);
      ins = {target: targetAt(cyc), imax: row.imax, grams: row.mass * 1000, mode: modeAt(cyc)};
    } else {
      if (T - lastInput > IDLE) startTour();
      since = T - viewAt;
      tgt = VIEW_FN[view](since);
      tgt.az += off.az;
      tgt.el = clamp(tgt.el + off.el, -10, 80);
      tgt.d *= off.k;
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
      const u = {cmd: inp.cmd, mode: inp.mode, imax: inp.imax, mass: inp.grams / 1000};
      if (!paused) {
        profile(dt);
        u.cmd = inp.cmd;
        step(sim, dt, u);
        traceT += dt;
      }
      r = {...readout(sim, u), mass: u.mass};
      while (traceT >= TRACE_S / 120) {
        traceT -= TRACE_S / 120;
        trace.push(r.ph);
        if (trace.length > 120) trace.shift();
      }
      if (!trace.length) trace.push(r.ph);
      tr = trace;
      ins = {target: inp.target, imax: inp.imax, grams: inp.grams, mode: inp.mode};
    }
    const ease = (tau) => 1 - Math.exp(-dt / tau);
    shell.xray += ((cut === 'xray' ? 1 : 0) - shell.xray) * ease(0.3);
    shell.explode += ((cut === 'explode' ? 1 : 0) - shell.explode) * ease(0.3);

    const k = ease(AP.on ? 0.12 : 0.4);
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd', 'sx', 'sy']) cam[key] += (tgt[key] - cam[key]) * k;
    st.frame(r, {...cam, az: cam.az * D2R, el: cam.el * D2R}, shell);
    ui.root.style.display = hidden ? 'none' : '';
    frameConsole({r, ...ins, cam: view, cut, shell, paused, since, trace: tr, cursor});
    if (chip.classList.contains('on') !== AP.on || !chip.firstChild) {
      chip.classList.toggle('on', AP.on);
      chip.innerHTML = AP.on ? '<i></i>TOUR AUTOMÁTICO · CLIQUE PARA ASSUMIR' : '▶ RETOMAR TOUR';
    }
    requestAnimationFrame(frame);
  };
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
  window.LIVE = {st, startTour, takeOver, sim, inp};
}
