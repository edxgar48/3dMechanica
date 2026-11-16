// The film: the machine (machine.js) in the studio (stage.js) under the overlay (console.js), as a pure function of t.
// The operator's moves are the script in ../__NAME__-film/timeline.json, the one source of every time: this film, the
// live page's auto tour, the score and the review sheets all read it. Moves: {cam}, {cut}, {rpm: [from, to, seconds]}.
import {runSim} from '3dmechanica-kit/runtime.js';
import TIMELINE from '../__NAME__-film/timeline.json';
import {CAMS, createConsole, RPM_MAX, RPM_MIN} from './console.js';
import {P, pinY, pistonSpeed, travel} from './kin.js';
import {createStage} from './stage.js';

export const SCRIPT = TIMELINE.script;
export const DURATION = TIMELINE.duration;
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: '__TITLE__', subtitle: ''}, director: {enabled: false}, watermark: ''};
export const PLAY = 20; // playback divider: the machine turns at 1/20 of its real speed on screen
const D2R = Math.PI / 180;
const mm = (v) => v * 0.001;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const ss = (a, b, t) => smoother((t - a) / (b - a));

// ------------------------------------------------------------ speed and the crank angle
const RPM_EV = SCRIPT.find((e) => e.rpm);
export const rpmAt = (t) => (RPM_EV ? RPM_EV.rpm[0] + (RPM_EV.rpm[1] - RPM_EV.rpm[0]) * ss(RPM_EV.t, RPM_EV.t + RPM_EV.rpm[2], t) : 600);
// the angle integrates a changing speed, so it is tabulated once at load and render(t) only reads it
const DT = 1 / 240;
const TH = [];
for (let t = 0, th = 30; t <= DURATION + 1; t += DT) {
  TH.push(th);
  th += ((rpmAt(t + DT / 2) / 60) * 360 * DT) / PLAY;
}
export const thetaAt = (t) => {
  const u = Math.max(0, Math.min(TH.length - 2, t / DT));
  const i = Math.floor(u);
  return TH[i] + (TH[i + 1] - TH[i]) * (u - i);
};
export const cutAt = (t) => SCRIPT.filter((e) => e.cut && e.t <= t).pop()?.cut ?? 'solid';

// ------------------------------------------------------------ views, each a function of u (seconds since it came on)
// the camera aims halfway up the machine, crank axis to piston crown
const TY = mm((P.rod + P.stroke / 2 + P.pistonH) / 2);
export const VIEW_FN = {
  hero: (u) => ({tx: 0, ty: TY, tz: 0, az: 38 + 2 * u, el: 16, d: 0.62, sx: 120, sy: 0}),
  front: (u) => ({tx: 0, ty: TY, tz: 0, az: 0 + 1.5 * u, el: 6, d: 0.56, sx: 120, sy: 0}),
  side: (u) => ({tx: 0, ty: TY, tz: 0, az: 90 - 1.5 * u, el: 8, d: 0.56, sx: 120, sy: 0}),
  top: (u) => ({tx: 0, ty: TY, tz: 0, az: 20 + 2 * u, el: 62, d: 0.6, sx: 120, sy: 0}),
};
const VIEWS = SCRIPT.filter((e) => e.cam).map((e) => [e.t, e.cam]);
export const camName = (t) => VIEWS.filter(([t0]) => t0 <= t).pop()?.[1] ?? CAMS[0];
export const camSince = (t) => t - (VIEWS.filter(([t0]) => t0 <= t).pop()?.[0] ?? 0);
export function blend(a, b, k) {
  const o = {};
  for (const key in b) o[key] = key === 'az' ? a.az + ((((b.az - a.az + 540) % 360) - 180) * k) : a[key] + (b[key] - a[key]) * k;
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
const REST = [[820, 470], [760, 400], [900, 520]];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).map((e) => {
    if (e.rpm) {
      const knob = (r) => ui.knobAt((r - RPM_MIN) / (RPM_MAX - RPM_MIN));
      return {t: e.t, spot: knob(e.rpm[0]), drag: e.rpm[2], along: (t) => knob(rpmAt(t))};
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
  WP.sort((a, b) => a[0] - b[0]);
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
  return ({deg, rpm, cam, cut, paused = false, since, cursor}) => {
    const crown = st.project(0, mm(pinY(deg) - P.pinDrop + P.pistonH), 0);
    ui.update({
      deg,
      rpm,
      cam,
      cut,
      paused,
      travel: travel(deg),
      speed: pistonSpeed(deg, rpm),
      callout: {at: crown, label: [1190, 250], o: cut === 'glass' ? ss(0.4, 1.0, since) : 0},
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
    const cutT = (t) => t - (SCRIPT.filter((e) => e.cut && e.t <= t).pop()?.t ?? 0);
    return {
      resize,
      render(t) {
        const deg = thetaAt(t);
        const c = camAt(t);
        const cut = cutAt(t);
        st.frame(deg, {...c, az: c.az * D2R, el: c.el * D2R}, {cut});
        frame({deg, rpm: rpmAt(t), cam: camName(t), cut, since: cutT(t), cursor: cursorAt(t)});
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
