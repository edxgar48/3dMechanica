// The math of an external gear pump: two equal 12-tooth involute spur gears in a figure-eight bore. One input, the
// drive shaft angle (degrees), and every pose and readout as a function of it. No three.js in here.
//
// Reference: a Rexroth AZPF-style pump, the 8 cm³/rev size. Rexroth's standard external gear pumps run 12-tooth
// gears; module 2.5 mm and a 17 mm face give that catalogue size. Check by hand:
//   pitch radius rp = m·z/2 = 15 mm, centre distance a = 2·rp = 30 mm, tip radius ra = rp + m = 17.5 mm
//   base pitch pb = π·m·cos 20° = 7.38 mm
//   V = 2π·b·(ra² − a²/4 − pb²/12) = 2π · 17 · (306.25 − 225 − 4.54) = 8194 mm³ = 8.19 cm³/rev
//   at 1500 rpm: 8.19 × 1500 = 12.3 L/min; at 150 bar the shaft needs 150e5 × 8.19e-6 / 2π = 19.6 N·m.

export const P = {z: 12, m: 2.5, b: 17, alpha: 20, clear: 0.15}; // teeth, module mm, face width mm, pressure angle °, tip clearance mm
const D2R = Math.PI / 180;
export const rp = (P.m * P.z) / 2;
export const ra = rp + P.m;
export const rf = rp - 1.25 * P.m;
export const rb = rp * Math.cos(P.alpha * D2R);
export const a = 2 * rp;
export const pb = Math.PI * P.m * Math.cos(P.alpha * D2R);
export const pitchAngle = (2 * Math.PI) / P.z;
/** Contact ratio: how many tooth pairs share the load on average (1 < ε < 2 keeps one pair always sealing). */
export const contactRatio = (2 * Math.sqrt(ra * ra - rb * rb) - a * Math.sin(P.alpha * D2R)) / pb;
/** Displacement per shaft revolution, cm³ (mean over a tooth pitch). */
export const displacement = (2 * Math.PI * P.b * (ra * ra - (a * a) / 4 - (pb * pb) / 12)) / 1000;

/** Distance of the contact point from the pitch point along the line of action, mm: sweeps ±pb/2 once per tooth. */
const contactU = (deg) => {
  const k = ((((deg * D2R) % pitchAngle) + pitchAngle) % pitchAngle) - pitchAngle / 2;
  return rb * k;
};
/** Instantaneous flow, L/min: q = ω·b·(ra² − a²/4 − u²). Its mean over a pitch is displacement × speed. */
export const flowAt = (deg, rpm) => {
  const u = contactU(deg);
  const omega = (rpm * 2 * Math.PI) / 60;
  return (omega * P.b * (ra * ra - (a * a) / 4 - u * u) * 60) / 1e6;
};
export const meanFlow = (rpm) => (displacement * rpm) / 1000;
/** Peak-to-peak flow ripple as a share of the mean. */
export const ripple = ((pb * pb) / 4) / (ra * ra - (a * a) / 4 - (pb * pb) / 12);
/** Theoretical shaft torque, N·m, against an outlet pressure in bar (inlet at 0 bar gauge). */
export const torque = (bar) => (bar * 1e5 * displacement * 1e-6) / (2 * Math.PI);
/** Hydraulic power, kW. */
export const power = (bar, rpm) => (bar * 1e5 * (meanFlow(rpm) / 60000)) / 1000;

/** Gear angles (radians) for a drive shaft angle: the drive gear on the left turns clockwise, the idler counter. */
export const gearAngles = (deg) => {
  const t = deg * D2R;
  return {drive: -t, idler: t + Math.PI + Math.PI / P.z};
};

// ------------------------------------------------------------ the oil carried round in the tooth spaces
// Fluid enters where the teeth unmesh (the inlet, below the mesh), rides round the outside in the spaces between the
// teeth and the bore, and is squeezed out where the teeth mesh again (the outlet, above). Each space's progress s runs
// 0 at the inlet to 1 at the outlet over a 240° arc; outside that arc the space is in the mesh or open to a port.
const ARC = (4 * Math.PI) / 3;
const wrap = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
/** Progress 0..1 (or -1 when not carried) of tooth space k of the drive (side 0) or idler (side 1). */
export const spaceProgress = (deg, side, k) => {
  const g = gearAngles(deg);
  const phi = (side === 0 ? g.drive : g.idler) + k * pitchAngle + Math.PI / P.z;
  const d = side === 0 ? wrap(-Math.PI / 3 - phi) : wrap(phi + (2 * Math.PI) / 3);
  return d < ARC ? d / ARC : -1;
};

// ------------------------------------------------------------ the involute tooth outline (2D, mm, gear centre at origin)
const inv = (x) => Math.tan(x) - x;
/** Closed outline of one gear: an involute flank from the base circle up, a radial flank below it, tip and root arcs. */
export function gearOutline({flankSteps = 10, arcSteps = 4} = {}) {
  const psiP = Math.PI / (2 * P.z) + inv(P.alpha * D2R); // half-thickness angle on the base circle, plus inv(α)
  const half = (r) => (r <= rb ? psiP : psiP - inv(Math.acos(rb / r)));
  const pts = [];
  const rStart = Math.max(rf, Math.min(rb, ra));
  for (let k = 0; k < P.z; k++) {
    const c = k * pitchAngle;
    const flank = [];
    for (let i = 0; i <= flankSteps; i++) flank.push(rStart + ((ra - rStart) * i) / flankSteps);
    const root0 = half(rf);
    // root to base on a radial line, then the involute up to the tip
    pts.push([rf * Math.cos(c - root0), rf * Math.sin(c - root0)]);
    for (const r of flank) pts.push([r * Math.cos(c - half(r)), r * Math.sin(c - half(r))]);
    const tip = half(ra);
    for (let i = 1; i < arcSteps; i++) {
      const ang = c - tip + (2 * tip * i) / arcSteps;
      pts.push([ra * Math.cos(ang), ra * Math.sin(ang)]);
    }
    for (const r of [...flank].reverse()) pts.push([r * Math.cos(c + half(r)), r * Math.sin(c + half(r))]);
    pts.push([rf * Math.cos(c + root0), rf * Math.sin(c + root0)]);
    // root arc to the next tooth
    const next = c + pitchAngle - root0;
    for (let i = 1; i < arcSteps; i++) {
      const ang = c + root0 + ((next - c - root0) * i) / arcSteps;
      pts.push([rf * Math.cos(ang), rf * Math.sin(ang)]);
    }
  }
  return pts;
}
