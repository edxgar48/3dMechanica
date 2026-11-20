// The film: the motor (machine.js) in the studio (stage.js) under the overlay (console.js), as a pure function of t.
// The operator's moves are the script in ../bldc-stepper-film/timeline.json, the one source of every time: this film,
// the live page's auto tour, the score and the review sheets all read it. Moves: {cam}, {cut: solid|xray|explode},
// {mode: full|micro|foc}, {goto: [deg, seconds]}, {current: [from A, to A, seconds]}, {load: [from g, to g, seconds]}.
// The motor runs in real time: the simulation is integrated once at load (drive.js) and render(t) only reads it.
import {runSim} from '3dmechanica-kit/runtime.js';
import TIMELINE from '../bldc-stepper-film/timeline.json';
import {AMP_MAX, ANG, CAMS, createConsole, G_MAX, TRACE_S} from './console.js';
import {DEF, ss, tabulate} from './drive.js';
import {pp} from './kin.js';
import {ARM_Z, DIAL_R} from './machine.js';
import {createStage} from './stage.js';

export const SCRIPT = TIMELINE.script;
export const DURATION = TIMELINE.duration;
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'dark', hud: {enabled: false, title: 'BLDC como motor de passo', subtitle: ''}, director: {enabled: false}, watermark: ''};
const D2R = Math.PI / 180;
const mm = (v) => v * 0.001;
export {ss};

export const SIM = tabulate(SCRIPT, DURATION);
export const {cmdAt, currentAt, loadAt, modeAt} = SIM.inp;
/** The value the target slider shows: where the current goto is headed. */
export const targetAt = (t) => SCRIPT.filter((e) => e.goto && e.t <= t).pop()?.goto[0] ?? DEF.cmd;
export const cutAt = (t) => SCRIPT.filter((e) => e.cut && e.t <= t).pop()?.cut ?? 'solid';
/** The cutaway as two eased amounts. */
export const shellAt = (t) => {
  let xray = 0;
  let explode = 0;
  for (const e of SCRIPT) {
    if (!e.cut) continue;
    const k = ss(e.t, e.t + 1.2, t);
    xray += ((e.cut === 'xray' ? 1 : 0) - xray) * k;
    explode += ((e.cut === 'explode' ? 1 : 0) - explode) * k;
  }
  return {xray, explode};
};
/** The last TRACE_S seconds of phase currents, 120 samples, from the tabulated run. */
export const traceAt = (t) => {
  const out = [];
  for (let i = 0; i < 120; i++) out.push(SIM.at(Math.max(0, t - TRACE_S + (i / 119) * TRACE_S)).ph);
  return out;
};

// ------------------------------------------------------------ views, each a function of u (seconds since it came on)
export const VIEW_FN = {
  hero: (u) => ({tx: 0, ty: mm(-25), tz: mm(10), az: 32 + 1.5 * u, el: 16, d: 0.8, sx: 0, sy: 10}),
  front: (u) => ({tx: 0, ty: mm(-10), tz: 0, az: -3 + 0.8 * u, el: 4, d: 0.86, sx: 0, sy: 10}),
  stator: (u) => ({tx: mm(0), ty: mm(0), tz: mm(4), az: 14 - 1.2 * u, el: 12, d: 0.24, sx: 0, sy: 10}),
  encoder: (u) => ({tx: mm(28), ty: mm(-78), tz: mm(-50), az: 150 + 1.5 * u, el: 22, d: 0.56, sx: 0, sy: 10}),
  side: (u) => ({tx: 0, ty: mm(-20), tz: mm(-20), az: 78 - 1.5 * u, el: 10, d: 0.9, sx: 0, sy: 10}),
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
const REST = [[820, 560], [700, 600], [900, 520]];
const DRAGS = [
  ['goto', (ui) => ui.angKnob, (e) => [targetAt(e.t - 0.01), e.goto[0], e.goto[1]], ANG],
  ['current', (ui) => ui.ampKnob, (e) => e.current, [0, AMP_MAX]],
  ['load', (ui) => ui.loadKnob, (e) => e.load, [0, G_MAX]],
];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).map((e) => {
    for (const [key, knob, span, [lo, hi]] of DRAGS) {
      if (!e[key]) continue;
      const [a, b, d] = span(e);
      const k = (v) => knob(ui)((v - lo) / (hi - lo));
      return {t: e.t, spot: k(a), drag: Math.min(d, 1.2), along: (tt) => k(a + (b - a) * ss(e.t, e.t + Math.min(d, 1.2), tt))};
    }
    return {t: e.t, spot: ui.spots[e.cam ?? e.cut ?? e.mode], drag: 0};
  });
  const WP = [[0, 980, 640]];
  EV.forEach((e, i) => {
    WP.push([e.t - 0.16, ...e.spot]);
    if (e.drag) for (let k = 0; k <= 12; k++) WP.push([e.t + (k / 12) * e.drag + 0.02, ...e.along(e.t + (k / 12) * e.drag)]);
    else WP.push([e.t + 0.24, ...e.spot]);
    WP.push([e.t + e.drag + 1.2, ...REST[i % REST.length]]);
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
  const v = st.machine.parts;
  const wp = (obj) => {
    const p = obj.getWorldPosition(obj.position.clone().set(0, 0, 0));
    return st.project(p.x, p.y, p.z);
  };
  return ({r, target, imax, grams, mode, cam, cut, shell, paused = false, since, trace, cursor}) => {
    const vis = ss(0.5, 1.1, since);
    const inside = Math.max(shell.xray, shell.explode);
    const a = r.deg * D2R;
    const c = r.cmd * D2R;
    let callouts = [];
    if (cam === 'stator') {
      // the coil on the top tooth and the magnet nearest it
      const coil = v.coils[3];
      callouts = [
        {name: `Bobina · fase ${'ABC'[coil.phase]}`, sub: `${r.ph[coil.phase] * coil.dir >= 0 ? 'polo norte' : 'polo sul'} · ${Math.abs(r.ph[coil.phase]).toFixed(2)} A`, at: st.project(0, mm(15), mm(7.5)), label: [1010, 214], o: vis * ss(0.4, 0.9, inside)},
        {name: 'Ímãs do rotor', sub: `14 polos · ${pp} pares · 1 volta elétrica = ${(360 / pp).toFixed(1)}°`, at: wp(v.magnets[(Math.round(((90 - r.deg - 285) / (360 / 14))) % 14 + 14) % 14]), label: [430, 640], o: vis * ss(0.4, 0.9, inside)},
      ];
    } else if (cam === 'encoder') {
      callouts = [
        {name: 'Encoder AS5600', sub: `12 bits · contagem ${r.enc} de 4096`, at: wp(v.enc), label: [1010, 230], o: vis},
        {name: 'Driver FOC', sub: '3 meias-pontes · 10 kHz', at: wp(v.drv), label: [430, 690], o: vis},
      ];
    } else {
      callouts = [
        {name: 'Comando', sub: `${r.cmd.toFixed(1)}° · onde o driver manda`, at: st.project(mm((DIAL_R + 10) * Math.sin(c)), mm(-(DIAL_R + 10) * Math.cos(c)), mm(-13)), label: cam === 'side' ? [1010, 170] : [1010, 214], o: vis},
        {name: 'Braço + peso', sub: `${Math.round(grams)} g a 100 mm · ${r.load.toFixed(2)} N·m`, at: st.project(mm(100 * Math.sin(a)), mm(-100 * Math.cos(a)), mm(ARM_Z + 20)), label: [430, 600], o: vis},
      ];
    }
    ui.update({r, target, imax, grams, mode, cam, cut, paused, trace, callouts, cursor});
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
        const r = SIM.at(t);
        const c = camAt(t);
        const shell = shellAt(t);
        st.frame(r, {...c, az: c.az * D2R, el: c.el * D2R}, shell);
        frame({r, target: targetAt(t), imax: currentAt(t), grams: loadAt(t), mode: modeAt(t), cam: camName(t), cut: cutAt(t), shell, since: camSince(t), trace: traceAt(t), cursor: cursorAt(t)});
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
