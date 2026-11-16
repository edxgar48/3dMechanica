// The film: the pump (machine.js) in the studio (stage.js) under the overlay (console.js), as a pure function of t.
// The operator's moves are the script in ../gear-pump-film/timeline.json, the one source of every time: this film, the
// live page's auto tour, the score and the review sheets all read it. Moves: {cam}, {cut: solid|open|glass},
// {rpm: [from, to, seconds]}, {load: [from bar, to bar, seconds]}.
import {runSim} from '3dmechanica-kit/runtime.js';
import TIMELINE from '../gear-pump-film/timeline.json';
import {BAR_MAX, CAMS, createConsole, RPM_MAX} from './console.js';
import {a, meanFlow, P, power, ra, torque} from './kin.js';
import {HH} from './machine.js';
import {createStage} from './stage.js';

export const SCRIPT = TIMELINE.script;
export const DURATION = TIMELINE.duration;
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'dark', hud: {enabled: false, title: 'Gear Pump', subtitle: ''}, director: {enabled: false}, watermark: ''};
export const PLAY = 50; // playback divider: the shaft turns at 1/50 of its real speed on screen
const D2R = Math.PI / 180;
const mm = (v) => v * 0.001;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const ss = (a0, a1, t) => smoother((t - a0) / (a1 - a0));

// ------------------------------------------------------------ speed, pressure and the shaft angle
const ramp = (key, dflt) => {
  const ev = SCRIPT.find((e) => e[key]);
  return (t) => (ev ? ev[key][0] + (ev[key][1] - ev[key][0]) * ss(ev.t, ev.t + ev[key][2], t) : dflt);
};
export const rpmAt = ramp('rpm', 1000);
export const barAt = ramp('load', 40);
// the angle integrates a changing speed, so it is tabulated once at load and render(t) only reads it
const DT = 1 / 240;
const TH = [];
for (let t = 0, th = 4; t <= DURATION + 1; t += DT) {
  TH.push(th);
  th += ((rpmAt(t + DT / 2) / 60) * 360 * DT) / PLAY;
}
export const thetaAt = (t) => {
  const u = Math.max(0, Math.min(TH.length - 2, t / DT));
  const i = Math.floor(u);
  return TH[i] + (TH[i + 1] - TH[i]) * (u - i);
};
export const cutAt = (t) => SCRIPT.filter((e) => e.cut && e.t <= t).pop()?.cut ?? 'solid';
/** The cutaway as two eased amounts: open slides the front cover off, glass turns the shell to glass. */
export const shellAt = (t) => {
  let open = 0;
  let glass = 0;
  for (const e of SCRIPT) {
    if (!e.cut) continue;
    const k = ss(e.t, e.t + 1.2, t);
    open += ((e.cut === 'open' ? 1 : 0) - open) * k;
    glass += ((e.cut === 'glass' ? 1 : 0) - glass) * k;
  }
  return {open, glass};
};

// ------------------------------------------------------------ views, each a function of u (seconds since it came on)
export const VIEW_FN = {
  hero: (u) => ({tx: 0, ty: 0, tz: mm(6), az: 34 + 2 * u, el: 18, d: 0.42, sx: 40, sy: 10}),
  front: (u) => ({tx: 0, ty: 0, tz: 0, az: -4 + 1.2 * u, el: 5, d: 0.3, sx: 40, sy: 10}),
  // nearly face on: the drive shaft points at the camera and reads as a disc on the drive hub, the mesh stays clear
  mesh: (u) => ({tx: mm(4), ty: mm(1), tz: mm(P.b / 2), az: 6 - 1 * u, el: 7, d: 0.15, sx: 40, sy: 10}),
  side: (u) => ({tx: 0, ty: 0, tz: mm(8), az: 72 - 2 * u, el: 12, d: 0.42, sx: 40, sy: 10}),
  top: (u) => ({tx: 0, ty: 0, tz: mm(4), az: 18 + 2 * u, el: 64, d: 0.42, sx: 40, sy: 10}),
};
const VIEWS = SCRIPT.filter((e) => e.cam).map((e) => [e.t, e.cam]);
export const camName = (t) => VIEWS.filter(([t0]) => t0 <= t).pop()?.[1] ?? CAMS[0];
export const camSince = (t) => t - (VIEWS.filter(([t0]) => t0 <= t).pop()?.[0] ?? 0);
export function blend(p, q, k) {
  const o = {};
  for (const key in q) o[key] = key === 'az' ? p.az + ((((q.az - p.az + 540) % 360) - 180) * k) : p[key] + (q[key] - p[key]) * k;
  return o;
}
// a camera move: every parameter eased over 1.6 s, the azimuth the short way round
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
const REST = [[820, 470], [760, 520], [900, 430]];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).map((e) => {
    if (e.rpm || e.load) {
      const [key, knob, at, max] = e.rpm ? ['rpm', ui.speedKnob, rpmAt, RPM_MAX] : ['load', ui.loadKnob, barAt, BAR_MAX];
      return {t: e.t, spot: knob(e[key][0] / max), drag: e[key][2], along: (tt) => knob(at(tt) / max)};
    }
    return {t: e.t, spot: ui.spots[e.cam ?? e.cut], drag: 0};
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
export function makeConsoleFrame(ui, st) {
  return ({deg, rpm, bar, cam, cut, shell, paused = false, since, cursor}) => {
    const vis = ss(0.5, 1.1, since);
    // in the mesh close-up the ports are off screen, so their leaders stay away
    const ports = cam === 'mesh' ? 0 : 1;
    const inside = Math.max(shell.open, shell.glass);
    ui.update({
      deg,
      rpm,
      bar,
      cam,
      cut,
      paused,
      flow: meanFlow(rpm),
      torque: torque(bar),
      power: power(bar, rpm),
      callouts: [
        {name: 'Outlet', sub: `${Math.round(bar)} bar · ${meanFlow(rpm).toFixed(1)} L/min`, at: st.project(0, mm(HH + 18), 0), label: [1010, 214], o: vis * ports},
        {name: 'Inlet', sub: 'Oil drawn in where the teeth part', at: st.project(0, mm(-HH - 18), 0), label: [1010, 660], o: vis * ports},
        {name: 'Drive gear', sub: `${P.z} teeth · turns the idler`, at: st.project(mm(-a / 2 - ra * 0.55), mm(ra * 0.55), mm(P.b / 2)), label: [430, 500], o: vis * ss(0.4, 0.9, inside)},
      ],
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
    return {
      resize,
      render(t) {
        const deg = thetaAt(t);
        const c = camAt(t);
        const shell = shellAt(t);
        st.frame(deg, {...c, az: c.az * D2R, el: c.el * D2R}, shell);
        frame({deg, rpm: rpmAt(t), bar: barAt(t), cam: camName(t), cut: cutAt(t), shell, since: camSince(t), cursor: cursorAt(t)});
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
