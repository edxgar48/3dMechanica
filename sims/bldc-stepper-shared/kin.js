// The math of a BLDC gimbal motor driven as a stepper. One input, time, drives a rigid-body simulation of the rotor and
// the arm it carries; every pose and readout comes from its state. No three.js in here.
//
// Reference: a GM4108-class gimbal outrunner (12 slots, 14 magnets, 46 mm bell), the motor SimpleFOC projects drive
// in open loop as a stepper and in closed loop with an AS5600 magnetic encoder. Values are representative of the
// class, not one datasheet. Check by hand:
//   pole pairs pp = 14 / 2 = 7: one electrical turn of the field moves the rotor 360 / 7 = 51.43°
//   six-step drive: 6 full steps per electrical turn → 6 · 7 = 42 steps per rev, 8.57° each
//   1/16 microstepping (sine currents): 42 · 16 = 672 microsteps per rev, 0.536° each
//   holding torque T = Kt · I · sin δ, at most Kt · I = 0.30 N·m/A · 0.9 A = 0.27 N·m
//   150 g at 100 mm held level: 0.150 · 9.81 · 0.100 = 0.147 N·m, plus the arm 0.012 N·m → δ = asin(0.159/0.27) = 36° e
//   380 g at 100 mm: 0.385 N·m > 0.27 N·m → the rotor slips a pole pair: 6 full steps, 51.4°, lost to the driver
//   AS5600: 12 bits → 4096 counts per rev, 0.088° each

export const P = {
  slots: 12,
  poles: 14,
  Kt: 0.3, // torque constant, N·m per A of field current
  R: 11, // phase resistance, Ω
  micro: 16, // microsteps per full step in micro mode
  cpr: 4096, // encoder counts per rev
  armL: 0.1, // load radius, m (where the weight hangs)
  armLen: 0.12, // arm length, m
  armM: 0.02, // arm mass, kg
  Jr: 2.2e-5, // rotor bell inertia, kg·m²
  b: 0.015, // viscous damping, N·m·s/rad (bearings, eddy currents)
  cog: 0.004, // cogging torque amplitude, N·m (84 periods per rev for 12N14P)
  g: 9.81,
};
export const pp = P.poles / 2;
export const STEPS_REV = 6 * pp;
export const STEP_DEG = 360 / STEPS_REV;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const lcm = (a, b) => {
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  return (a * b) / gcd(a, b);
};
export const COG_N = lcm(P.slots, P.poles);
/** 12N14P concentrated winding: tooth k carries phase A, B or C, wound + (upper case) or − (lower case). */
export const WINDING = 'AabBCcaABbcC';

export const MODES = ['full', 'micro', 'foc'];
/** Resolution of each mode, degrees of shaft per count the driver can command or see. */
export const resolution = (mode) => (mode === 'full' ? STEP_DEG : mode === 'micro' ? STEP_DEG / P.micro : 360 / P.cpr);
export const perRev = (mode) => (mode === 'full' ? STEPS_REV : mode === 'micro' ? STEPS_REV * P.micro : P.cpr);

/** Inertia about the shaft with a weight of m kg on the arm. */
export const inertia = (m) => P.Jr + (P.armM * P.armLen * P.armLen) / 3 + m * P.armL * P.armL;
/** Gravity torque on the shaft, N·m, with the arm at th rad from straight down (positive pulls it back down). */
export const gravity = (th, m) => (m * P.armL + (P.armM * P.armLen) / 2) * P.g * Math.sin(th);
/** Copper loss, W, for a field current of amplitude I in all three phases (sine). */
export const copper = (I) => 1.5 * P.R * I * I;
/** Phase currents for a field of amplitude I at electrical angle fe (rad). */
export const phases = (fe, I) => [I * Math.cos(fe), I * Math.cos(fe - (2 * Math.PI) / 3), I * Math.cos(fe + (2 * Math.PI) / 3)];

// ------------------------------------------------------------ the drive
// FOC position loop: PID on the encoder angle, output a q current, field placed 90° electrical ahead of the rotor.
const KP = 2.6; // A per rad
const KI = 14; // A per rad·s
const KD = 0.16; // A per rad/s

/** Open loop: the field is the command rounded to the mode's step, in electrical radians. */
export const openField = (cmdDeg, mode) => {
  const s = mode === 'full' ? 60 : 60 / P.micro;
  return Math.round((pp * cmdDeg) / s) * s * D2R;
};

/**
 * The simulation: state {th, w, integ, fe, I, tq} (rad, rad/s, A, field electrical rad, field amplitude A, motor N·m).
 * step(s, h, {cmd deg, mode, imax A, mass kg}) advances it h seconds at a 10 kHz control rate.
 */
export const DT = 1e-4;
export function newState() {
  return {th: 0, w: 0, integ: 0, fe: 0, I: 0.9, tq: 0, enc: 0};
}
export function step(s, h, {cmd, mode, imax, mass}) {
  const J = inertia(mass);
  for (let t = 0; t < h - 1e-9; t += DT) {
    const dt = Math.min(DT, h - t);
    const enc = Math.round((s.th * R2D) / (360 / P.cpr));
    s.enc = enc;
    if (mode === 'foc') {
      const meas = enc * (360 / P.cpr) * D2R;
      const err = cmd * D2R - meas;
      let iq = KP * err + KI * s.integ - KD * s.w;
      // anti-windup: the integrator only runs while the output is not pinned at the limit
      if (Math.abs(iq) < imax) s.integ += err * dt;
      iq = Math.max(-imax, Math.min(imax, iq));
      s.fe = pp * meas + Math.sign(iq || 1) * (Math.PI / 2);
      s.I = Math.abs(iq);
    } else {
      s.integ = 0;
      s.fe = openField(cmd, mode);
      s.I = imax;
    }
    s.tq = P.Kt * s.I * Math.sin(s.fe - pp * s.th);
    const acc = (s.tq - gravity(s.th, mass) - P.b * s.w - P.cog * Math.sin(COG_N * s.th)) / J;
    s.w += acc * dt;
    s.th += s.w * dt;
  }
  return s;
}

/** Readouts from a state and its inputs: every number the overlay shows. */
export function readout(s, {cmd, mode, mass}) {
  const deg = s.th * R2D;
  const delta = s.fe - pp * s.th;
  // whole electrical turns between the field and the rotor: each one is 6 full steps the driver thinks it made
  const slipped = mode === 'foc' ? 0 : Math.round(delta / (2 * Math.PI));
  const load = gravity(s.th, mass);
  return {
    deg,
    cmd,
    err: cmd - deg,
    delta: ((((delta * R2D + 180) % 360) + 360) % 360) - 180,
    lost: 6 * slipped || 0,
    load,
    hold: P.Kt * s.I,
    tq: s.tq,
    I: s.I,
    loss: copper(s.I),
    enc: ((s.enc % P.cpr) + P.cpr) % P.cpr,
    counts: Math.round(mode === 'foc' ? s.enc : (s.fe * R2D) / (mode === 'full' ? 60 : 60 / P.micro)),
    ph: phases(s.fe, s.I),
    fe: s.fe,
    re: pp * s.th,
  };
}
