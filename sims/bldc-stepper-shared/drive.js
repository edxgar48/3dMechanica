// The operator's inputs as functions of time, read from the film's script, and the simulation run once over them.
// Moves: {goto: [deg, seconds]}, {mode: full|micro|foc}, {current: [from A, to A, seconds]}, {load: [from g, to g,
// seconds]}. No three.js in here, so the score and the checks can run it too.
import {DT, newState, readout, step} from './kin.js';

const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const ss = (a0, a1, t) => smoother((t - a0) / (a1 - a0));

export const DEF = {cmd: 0, mode: 'micro', current: 0.9, load: 150};

export function inputs(script) {
  // a chain of ramps: each move eases from where the last one left the value
  const chain = (key, dflt, pick) => {
    const ev = script.filter((e) => e[key] !== undefined);
    return (t) => {
      let v = dflt;
      for (const e of ev) {
        if (e.t > t) break;
        const [from, to, dur] = pick(e[key], v);
        v = from + (to - from) * ss(e.t, e.t + dur, t);
      }
      return v;
    };
  };
  const cmdAt = chain('goto', DEF.cmd, ([to, dur], v) => [v, to, dur]);
  const currentAt = chain('current', DEF.current, ([a, b, d]) => [a, b, d]);
  const loadAt = chain('load', DEF.load, ([a, b, d]) => [a, b, d]);
  const modeAt = (t) => script.filter((e) => e.mode && e.t <= t).pop()?.mode ?? DEF.mode;
  return {cmdAt, currentAt, loadAt, modeAt};
}

/** Runs the simulation over the whole film once; at(t) returns the state and readout at any time (step-held). */
export function tabulate(script, duration, rate = 240) {
  const inp = inputs(script);
  const n = Math.ceil((duration + 1) * rate) + 1;
  const rows = [];
  const s = newState();
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const u = {cmd: inp.cmdAt(t), mode: inp.modeAt(t), imax: inp.currentAt(t), mass: inp.loadAt(t) / 1000};
    rows.push({t, ...u, ...readout(s, u), state: {th: s.th, w: s.w, integ: s.integ}});
    step(s, 1 / rate, u);
  }
  // linear between rows for the angle, the rest held from the row before
  const at = (t) => {
    const x = Math.max(0, Math.min(n - 1.001, t * rate));
    const i = Math.floor(x);
    const k = x - i;
    const a = rows[i];
    return {...a, deg: a.deg + (rows[i + 1].deg - a.deg) * k};
  };
  return {rows, rate, at, inp};
}
export {DT};
