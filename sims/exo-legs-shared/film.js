// The film: the exoskeleton (machine.js) on its walkway (stage.js) under the overlay (console.js), as a pure function
// of t. The operator's moves are the script in ../exo-legs-film/timeline.json, the one source of every time: this
// film, the live page's auto tour, the score and the review sheets all read it. Moves: {cam}, {mode: walk|explode},
// {speed: [from m/s, to m/s, seconds]}, {assist: [from, to, seconds]} (assistance as a share, 0..1).
import {runSim} from '3dmechanica-kit/runtime.js';
import TIMELINE from '../exo-legs-film/timeline.json';
import {CAMS, createConsole, V_MAX, V_MIN} from './console.js';
import {anglesAt, cadence, cycleRate, drawAt, eventAt, exoPower, exoTorque, hipHeight, inStance} from './kin.js';
import {PARTS} from './machine.js';
import {createStage} from './stage.js';

export const SCRIPT = TIMELINE.script;
export const DURATION = TIMELINE.duration;
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'dark', hud: {enabled: false, title: 'Exoskeleton', subtitle: ''}, director: {enabled: false}, watermark: ''};
const D2R = Math.PI / 180;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const ss = (a0, a1, t) => smoother((t - a0) / (a1 - a0));

// ------------------------------------------------------------ speed, assistance, explode, and the integrated gait
const ramp = (key, dflt) => {
  const ev = SCRIPT.find((e) => e[key]);
  return (t) => (ev ? ev[key][0] + (ev[key][1] - ev[key][0]) * ss(ev.t, ev.t + ev[key][2], t) : dflt);
};
export const speedAt = ramp('speed', 0.4);
export const assistAt = ramp('assist', 0.5);
export const modeAt = (t) => SCRIPT.filter((e) => e.mode && e.t <= t).pop()?.mode ?? 'walk';
/** Exploded amount 0..1, eased over 1.4 s after every mode change. */
export const explodeAt = (t) => {
  let e = 0;
  for (const m of SCRIPT) if (m.mode) e += ((m.mode === 'explode' ? 1 : 0) - e) * ss(m.t, m.t + 1.4, t);
  return e;
};
// the gait phase and the distance walked integrate a changing speed (and stop while the parts are out), so they are
// tabulated once at load and render(t) only reads them
const DT = 1 / 240;
const PH = [];
const WK = [];
for (let t = 0, ph = 0, wk = 0; t <= DURATION + 1; t += DT) {
  PH.push(ph);
  WK.push(wk);
  const go = 1 - explodeAt(t + DT / 2);
  ph += cycleRate(speedAt(t + DT / 2)) * DT * go;
  wk += speedAt(t + DT / 2) * DT * go;
}
const read = (tab) => (t) => {
  const u = Math.max(0, Math.min(tab.length - 2, t / DT));
  const i = Math.floor(u);
  return tab[i] + (tab[i + 1] - tab[i]) * (u - i);
};
export const phaseAt = read(PH);
export const walkedAt = read(WK);

/** Both legs' joint angles and the hip height for a phase, speed and exploded amount (the legs straighten as the parts
 * come out, so the exploded view reads as a standing device). */
export const poseFor = (phase, v, explode) => {
  const k = 1 - explode;
  const scale = (a) => ({hip: a.hip * k, knee: a.knee * k, ankle: a.ankle * k});
  const left = scale(anglesAt(phase, v));
  const right = scale(anglesAt(phase + 0.5, v));
  return {left, right, hipY: hipHeight(left, right)};
};

// ------------------------------------------------------------ views, each a function of u (seconds since it came on)
export const VIEW_FN = {
  hero: (u) => ({tx: 0.04, ty: 0.66, tz: 0, az: 34 + 1.5 * u, el: 9, d: 4.6, sx: 0, sy: 0}),
  side: (u) => ({tx: 0.05, ty: 0.64, tz: 0, az: 2 + 0.6 * u, el: 4, d: 4.4, sx: 0, sy: 0}),
  front: (u) => ({tx: 0, ty: 0.66, tz: 0, az: 82 + 0.8 * u, el: 7, d: 4.4, sx: 0, sy: 0}),
  knee: (u) => ({tx: 0.04, ty: 0.52, tz: 0.12, az: 22 - 1 * u, el: 10, d: 2.2, sx: 0, sy: 0}),
  back: (u) => ({tx: -0.05, ty: 0.7, tz: 0, az: -128 + 1.5 * u, el: 16, d: 4.3, sx: 0, sy: 0}),
};
const VIEWS = SCRIPT.filter((e) => e.cam).map((e) => [e.t, e.cam]);
export const camName = (t) => VIEWS.filter(([t0]) => t0 <= t).pop()?.[1] ?? CAMS[0];
export const camSince = (t) => t - (VIEWS.filter(([t0]) => t0 <= t).pop()?.[0] ?? 0);
export function blend(p, q, k) {
  const o = {};
  for (const key in q) o[key] = key === 'az' ? p.az + ((((q.az - p.az + 540) % 360) - 180) * k) : p[key] + (q[key] - p[key]) * k;
  return o;
}
export const camAt = (t) => {
  let i = 0;
  while (i < VIEWS.length - 1 && VIEWS[i + 1][0] <= t) i++;
  const view = (k) => VIEW_FN[VIEWS[k][1]](t - VIEWS[k][0]);
  const cur = view(i);
  if (i === 0) return cur;
  const k = ss(VIEWS[i][0], VIEWS[i][0] + 1.6, t);
  return k >= 1 ? cur : blend(view(i - 1), cur, k);
};

// ------------------------------------------------------------ the operator's pointer, from the same script
const REST = [[800, 470], [740, 520], [880, 430]];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).map((e) => {
    if (e.speed) {
      const at = (v) => ui.speedKnob((v - V_MIN) / (V_MAX - V_MIN));
      return {t: e.t, spot: at(e.speed[0]), drag: e.speed[2], along: (tt) => at(speedAt(tt))};
    }
    if (e.assist) return {t: e.t, spot: ui.assistKnob(e.assist[0]), drag: e.assist[2], along: (tt) => ui.assistKnob(assistAt(tt))};
    return {t: e.t, spot: ui.spots[e.cam ?? e.mode], drag: 0};
  });
  const WP = [[0, 980, 640]];
  EV.forEach((e, i) => {
    WP.push([e.t - 0.16, ...e.spot]);
    if (e.drag) for (let k = 0; k <= 12; k++) WP.push([e.t + (k / 12) * e.drag + 0.02, ...e.along(e.t + (k / 12) * e.drag)]);
    else WP.push([e.t + 0.24, ...e.spot]);
    WP.push([e.t + e.drag + 1.4, ...REST[i % REST.length]]);
  });
  WP.sort((p, q) => p[0] - q[0]);
  return (t) => {
    let i = 0;
    while (i < WP.length - 2 && t > WP[i + 1][0]) i++;
    const [t0, x0, y0] = WP[i];
    const [t1, x1, y1] = WP[i + 1];
    const k = t1 - t0 < 0.2 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : ss(t0, t1, t);
    let press = false;
    let ring = 0;
    let rx = 0;
    let ry = 0;
    for (const e of EV) {
      if (t >= e.t - 0.07 && t < e.t + Math.max(0.09, e.drag + 0.1)) press = true;
      if (t >= e.t && t < e.t + 0.55) {
        ring = 1 - (t - e.t) / 0.55;
        [rx, ry] = e.spot;
      }
    }
    return {x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, press, ring, ringX: rx, ringY: ry};
  };
}

// ------------------------------------------------------------ the overlay's data for a frame: every number from kin.js
const EXPLODED = ['battery', 'ctrl', 'frame', 'hipAct', 'thighLink', 'thighCuff', 'kneeAct', 'shankLink', 'shankCuff', 'ankle'];
export function makeConsoleFrame(ui, st) {
  const label = Object.fromEntries(PARTS.map((p, i) => [p.id, {n: `${String(i + 1).padStart(2, '0')}  ${p.name}`, sub: p.what}]));
  // labels in two columns beside the device, each column ordered by height so no two leaders cross
  const column = (items, x) => {
    items.sort((p, q) => p.at[1] - q.at[1]);
    let y = 120;
    for (const it of items) {
      y = Math.min(Math.max(it.at[1], y + 54), 700);
      it.label = [x, y];
    }
    return items;
  };
  return ({phase, v, assist, explode, cam, mode, paused = false, since, highlight, cursor}) => {
    const pt = (id) => {
      const w = st.machine.where(id);
      return w && st.project(...w);
    };
    let callouts = [];
    if (explode > 0.5) {
      const items = EXPLODED.map((id) => ({name: label[id].n, sub: label[id].sub, at: pt(id), o: ss(0.6, 1, explode)})).filter((c) => c.at);
      // the half nearer the left edge labels on the left, the rest on the right
      items.sort((p, q) => p.at[0] - q.at[0]);
      const half = Math.ceil(items.length / 2);
      callouts = [...column(items.slice(0, half), 410), ...column(items.slice(half), 935)];
    } else if (cam === 'hero' || cam === 'side' || cam === 'knee') {
      const o = ss(0.6, 1.2, since) * (1 - explode * 2);
      const tq = exoTorque(phase, assist);
      callouts = [
        {name: 'Hip actuator', sub: `${tq.hip.toFixed(1)} N·m`, at: pt('hipAct'), label: [1010, 220], o},
        {name: 'Knee actuator', sub: `${tq.knee.toFixed(1)} N·m`, at: pt('kneeAct'), label: [1010, 470], o},
      ];
    }
    const a = poseFor(phase, v, explode).left;
    ui.update({
      phase: ((phase % 1) + 1) % 1,
      event: eventAt(phase),
      stance: inStance(phase),
      v,
      cadence: cadence(v),
      assist,
      angles: a,
      torque: exoTorque(phase, assist),
      power: exoPower(phase, v, assist),
      draw: drawAt(v, assist),
      cam,
      mode,
      paused,
      highlight,
      callouts,
      cursor,
    });
  };
}

export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = createStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeCursor(ui);
    const frame = makeConsoleFrame(ui, st);
    const modeSince = (t) => t - (SCRIPT.filter((e) => e.mode && e.t <= t).pop()?.t ?? 0);
    return {
      resize,
      render(t) {
        const phase = phaseAt(t);
        const v = speedAt(t);
        const explode = explodeAt(t);
        const c = camAt(t);
        st.frame(poseFor(phase, v, explode), {...c, az: c.az * D2R, el: c.el * D2R}, {explode, walked: walkedAt(t)});
        const mode = modeAt(t);
        // in the exploded view the bill of materials lights one row at a time
        const highlight = mode === 'explode' ? PARTS[Math.floor(Math.max(0, modeSince(t) - 1.4) / 0.6) % PARTS.length].id : null;
        frame({phase, v, assist: assistAt(t), explode, cam: camName(t), mode, since: camSince(t), highlight, cursor: cursorAt(t)});
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
