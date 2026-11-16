// The math: real dimensions in real units, one input (the crank angle, degrees from top dead centre) and every pose
// and readout as a function of it. No three.js in here.
//
// The starting machine is a single-cylinder slider-crank. REPLACE P with the numbers from your reference (a manual, a
// cutaway drawing, a datasheet), then replace the functions with your own mechanism's. Check one by hand before you
// build anything on it: here the swept volume is π/4 · 68² · 45 mm³ = 163.4 cm³, and travel(180) is the full stroke.

export const P = {bore: 68, stroke: 45, rod: 85, pistonH: 52, pinDrop: 20}; // mm. Placeholder values: replace them.
export const R = P.stroke / 2;
const D2R = Math.PI / 180;

/** Crank pin centre [x, y] in mm, the crank axis at the origin, y up the bore. */
export const crankPin = (deg) => [R * Math.sin(deg * D2R), R * Math.cos(deg * D2R)];

/** Piston pin height above the crank axis: s = r cos φ + √(L² − r² sin² φ). */
export const pinY = (deg) => {
  const p = deg * D2R;
  return R * Math.cos(p) + Math.sqrt(P.rod ** 2 - (R * Math.sin(p)) ** 2);
};

/** The rod's lean from the bore axis, radians (positive leans the big end toward +x). */
export const rodLean = (deg) => {
  const [x, y] = crankPin(deg);
  return Math.atan2(x, pinY(deg) - y);
};

/** Piston travel down from top dead centre, mm. */
export const travel = (deg) => R + P.rod - pinY(deg);

/** Piston speed, m/s, positive moving up: ds/dθ (mm per degree) × θ' (degrees per second, rpm × 6). */
export const pistonSpeed = (deg, rpm) => ((pinY(deg + 0.25) - pinY(deg - 0.25)) / 0.5) * rpm * 6 * 0.001;

/** Swept volume, cm³. */
export const displacement = ((Math.PI / 4) * P.bore ** 2 * P.stroke) / 1000;
