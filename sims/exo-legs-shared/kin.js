// The math of a powered hip-knee exoskeleton walking with its user. One input, the gait phase of the left leg
// (0..1, heel strike to heel strike; the right leg runs half a cycle behind), and every pose and readout as a function of
// it and of two settings: walking speed and assistance. No three.js in here.
//
// References
//   Gait: sagittal hip, knee and ankle angles and joint moments over the cycle, approximated from Winter's normative
//   adult curves (The Biomechanics and Motor Control of Human Gait, 1991): flexion and dorsiflexion positive, moments in
//   N·m per kg of body mass, extension (hip, knee) and plantarflexion (ankle) positive.
//   Body: Winter's segment proportions of height H: thigh 0.245 H, shank 0.246 H, foot 0.152 H, ankle height 0.039 H.
//   Device class: commercial hip-knee exoskeletons (Ekso Indego): four brushless motors with reductions in the thigh
//   segments driving both hips and knees, a 33.3 V 159 Wh Li-ion pack, users 155-191 cm up to 113 kg, top speed 3 km/h,
//   clinical walking around 0.35 m/s.
// Check by hand: H = 1.75 m gives a 0.429 m thigh and 0.431 m shank, so the hip sits 0.928 m up on a straight leg; at
// 0.4 m/s the stride model gives 0.82 m and 58.5 steps a minute; a 75 kg user's 0.8 N·m/kg hip moment is 60 N·m, so a
// 50 % assist asks 30 N·m of the hip actuator.
//
// This is a design study, not a certified medical device: a real exoskeleton needs a risk analysis (ISO 14971),
// the personal-care robot safety standard (ISO 13482), clinical testing and regulatory clearance before anyone wears it.

export const USER = {H: 1.75, mass: 75};
export const SEG = {
  thigh: 0.245 * USER.H,
  shank: 0.246 * USER.H,
  foot: 0.152 * USER.H,
  ankleH: 0.039 * USER.H,
  hipHalf: 0.09, // half the distance between the hip joint centres, m
};
export const SPEC = {
  heightRange: [1.55, 1.91],
  maxUser: 100, // kg, design limit (the reference device allows 113)
  actuators: 4,
  peakTorque: 80, // N·m per joint, design target: covers sit-to-stand at ~1 N·m/kg for the heaviest user
  gear: 100, // harmonic drive ratio
  battery: {V: 33.3, Wh: 159},
  stops: {hip: [-20, 110], knee: [0, 110]}, // mechanical end stops, degrees
  vMax: 0.83, // m/s, 3 km/h
};
const D2R = Math.PI / 180;

// ------------------------------------------------------------ normative curves, percent of the cycle → value
const HIP = [[0, 30], [10, 28], [20, 20], [30, 10], [40, 0], [50, -8], [55, -10], [60, -5], [65, 5], [70, 15], [75, 24], [80, 30], [85, 33], [90, 33], [95, 31]];
const KNEE = [[0, 5], [5, 12], [12, 18], [20, 14], [30, 8], [40, 5], [45, 6], [50, 10], [55, 20], [60, 35], [65, 50], [70, 60], [73, 62], [78, 55], [85, 35], [92, 12], [97, 4]];
const ANKLE = [[0, 0], [5, -5], [10, -3], [20, 3], [30, 7], [40, 10], [45, 10], [50, 5], [55, -5], [60, -15], [63, -18], [67, -12], [72, -5], [80, 0], [90, 1], [95, 0]];
const M_HIP = [[0, 0.4], [5, 0.8], [10, 0.6], [20, 0.2], [30, 0], [40, -0.4], [50, -0.7], [55, -0.6], [60, -0.3], [65, -0.1], [75, 0], [85, 0.1], [92, 0.3], [97, 0.35]];
const M_KNEE = [[0, -0.1], [5, 0.3], [12, 0.55], [20, 0.3], [30, 0], [40, -0.2], [50, -0.1], [55, 0.1], [60, 0.1], [65, 0], [75, -0.05], [85, -0.2], [92, -0.25], [97, -0.15]];
const M_ANKLE = [[0, 0], [5, -0.1], [10, 0.1], [20, 0.4], [30, 0.8], [40, 1.2], [48, 1.5], [52, 1.45], [58, 0.8], [62, 0.1], [65, 0], [80, 0], [95, 0]];

/** Periodic Catmull-Rom through [percent, value] keys. */
const curve = (keys) => (phase) => {
  const x = ((((phase % 1) + 1) % 1) * 100);
  const n = keys.length;
  let i = n - 1;
  for (let k = 0; k < n; k++) if (keys[k][0] <= x) i = k;
  const at = (k) => {
    const j = ((k % n) + n) % n;
    const lap = Math.floor(k / n);
    return [keys[j][0] + lap * 100, keys[j][1]];
  };
  const [x1, p1] = at(i);
  const [x2, p2] = at(i + 1);
  const [, p0] = at(i - 1);
  const [, p3] = at(i + 2);
  const u = (x - x1) / (x2 - x1);
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
};
const hipC = curve(HIP);
const kneeC = curve(KNEE);
const ankleC = curve(ANKLE);
const mHipC = curve(M_HIP);
const mKneeC = curve(M_KNEE);
const mAnkleC = curve(M_ANKLE);

// ------------------------------------------------------------ speed: stride, cadence, and how wide the joints swing
/** Stride length (m) at a walking speed (m/s): slower walking takes shorter strides. */
export const stride = (v) => 0.6 + 0.55 * v;
/** Cadence, steps a minute (two steps a stride). */
export const cadence = (v) => (120 * v) / stride(v);
/** Gait cycles a second. */
export const cycleRate = (v) => cadence(v) / 120;
// joint excursions shrink at slow, assisted walking speeds; full normative swing at 1.2 m/s
const swing = (v) => 0.62 + 0.38 * Math.min(1, v / 1.2);

/** Joint angles in degrees for one leg at its own phase: hip and knee flexion, ankle dorsiflexion. */
export const anglesAt = (phase, v) => {
  const k = swing(v);
  return {hip: 10 + (hipC(phase) - 10) * k, knee: kneeC(phase) * k, ankle: ankleC(phase) * k};
};
/** Biological joint moments of the user, N·m. */
export const momentsAt = (phase) => ({hip: mHipC(phase) * USER.mass, knee: mKneeC(phase) * USER.mass, ankle: mAnkleC(phase) * USER.mass});
/** Exoskeleton joint torques, N·m: a share of the user's moment at the hip and knee (the ankle is passive). */
export const exoTorque = (phase, assist) => {
  const m = momentsAt(phase);
  return {hip: m.hip * assist, knee: m.knee * assist};
};
/** Mechanical power at the hip and knee actuators, W (torque × joint speed, positive when the motor drives). */
export const exoPower = (phase, v, assist) => {
  const h = 1e-3;
  const a0 = anglesAt(phase - h, v);
  const a1 = anglesAt(phase + h, v);
  const w = (d) => ((d * D2R) / (2 * h)) * cycleRate(v); // rad/s
  const t = exoTorque(phase, assist);
  // flexion positive angles against extension positive moments: power = -moment × flexion rate
  return {hip: -t.hip * w(a1.hip - a0.hip), knee: -t.knee * w(a1.knee - a0.knee)};
};
/** Average electrical draw of both legs (W) and runtime on the pack (h): |mechanical| at 60 % efficiency plus 15 W
 * of electronics, averaged over a cycle. */
export const drawAt = (v, assist) => {
  let s = 0;
  const n = 100;
  for (let i = 0; i < n; i++) {
    const p = exoPower(i / n, v, assist);
    const q = exoPower(i / n + 0.5, v, assist);
    s += Math.abs(p.hip) + Math.abs(p.knee) + Math.abs(q.hip) + Math.abs(q.knee);
  }
  const W = s / n / 0.6 + 15;
  return {W, hours: SPEC.battery.Wh / W};
};

/** Named gait event at a phase. */
export const eventAt = (phase) => {
  const x = (((phase % 1) + 1) % 1) * 100;
  if (x < 2) return 'HEEL STRIKE';
  if (x < 12) return 'LOADING RESPONSE';
  if (x < 31) return 'MID STANCE';
  if (x < 50) return 'TERMINAL STANCE';
  if (x < 62) return 'PRE-SWING';
  if (x < 75) return 'INITIAL SWING';
  if (x < 87) return 'MID SWING';
  return 'TERMINAL SWING';
};
export const inStance = (phase) => ((((phase % 1) + 1) % 1) * 100) < 62;

// ------------------------------------------------------------ the sagittal chain: x forward, y up, hip at the origin
/** Joint positions of one leg (m), hip at (0, 0): knee, ankle, heel and toe. a: angles in degrees. */
export const chain = (a) => {
  const th = a.hip * D2R;
  const ts = (a.hip - a.knee) * D2R;
  const tf = ts + a.ankle * D2R;
  const knee = [SEG.thigh * Math.sin(th), -SEG.thigh * Math.cos(th)];
  const ankle = [knee[0] + SEG.shank * Math.sin(ts), knee[1] - SEG.shank * Math.cos(ts)];
  const at = (fx, fy) => [ankle[0] + fx * Math.cos(tf) - fy * Math.sin(tf), ankle[1] + fx * Math.sin(tf) + fy * Math.cos(tf)];
  return {knee, ankle, heel: at(-0.25 * SEG.foot, -SEG.ankleH), toe: at(0.75 * SEG.foot, -SEG.ankleH)};
};
/** Hip height above the ground (m): the lower of the two feet rests on the floor. */
export const hipHeight = (left, right) => {
  const low = (c) => Math.min(c.heel[1], c.toe[1]);
  return -Math.min(low(chain(left)), low(chain(right)));
};
