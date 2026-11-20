// The motor on its test stand, built from code in metres from millimetres: a 12-slot stator with its coils, a bell
// with 14 magnets carrying an arm and a brass weight, a dial on the stand plate behind with a pointer for the commanded
// angle, the AS5600 encoder on the back of the shaft, and the driver board on the base. update(r, ops) poses everything
// from a readout of kin.js: the rotor angle, the field, the phase currents, the command, the load.
import * as THREE from 'three';
import {P, WINDING} from './kin.js';

const mm = (v) => v * 0.001;
const D2R = Math.PI / 180;
export const ACCENT = '#ff7a2f';
export const NORTH = '#ff7a2f';
export const SOUTH = '#4f9cf0';
// stator and rotor (mm)
const ST = {hub: 6.5, yoke: 11, tip: 19, tooth: 3.2, shoe: 8.6, stack: 12};
const BELL = {r: 23, wall: 1.5, z0: -8, z1: 9, cap: 1.6};
const MAG = {r0: 19.5, r1: 21.5, w: 7.6, len: 14};
export const DIAL_R = 128;
export const FLOOR = -165;
const PLATE_Z = -14; // front face of the stand plate
export const ARM_Z = BELL.z1 + BELL.cap + 2.5;
/** Rotor-local angle of magnet 0 (a north pole): with it the coils and magnets line up as kin.js's field says. */
const PHI0 = 285 * D2R;
/** The 12N14P winding, phases A C B round the stator for this rotor's direction (checked by alignment). */
const PHASE_OF = {A: 0, B: 2, C: 1};

export function buildMachine() {
  const root = new THREE.Group();
  const sh = (m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const std = (color, roughness = 0.5, metalness = 0.5, extra = {}) => new THREE.MeshStandardMaterial({color, roughness, metalness, envMapIntensity: 0.6, ...extra});
  const steel = std('#d4d8de', 0.35, 0.9);
  const alu = std('#b9bfc7', 0.45, 0.7);
  const lam = std('#8d949d', 0.42, 0.75);
  const plate = std('#4f565f', 0.62, 0.4);
  const board = std('#2f6b5a', 0.6, 0.1);
  const chip = std('#4b515a', 0.5, 0.2);
  const brass = std('#d2a85a', 0.38, 0.85);
  const ink = new THREE.MeshBasicMaterial({color: '#cfd3d9'});
  const accent = new THREE.MeshBasicMaterial({color: ACCENT, transparent: true, opacity: 0.95});
  const ghost = (m) => Object.assign(m, {transparent: true});
  const bellMat = ghost(std('#c3c9d1', 0.42, 0.75));
  const capMat = ghost(std('#c3c9d1', 0.42, 0.75));

  // ------------------------------------------------------------ the stand: base, plate, dial
  const stand = new THREE.Group();
  const base = sh(new THREE.Mesh(new THREE.BoxGeometry(mm(300), mm(8), mm(190)), plate));
  base.position.set(0, mm(FLOOR + 4), mm(-40));
  // the upright plate, bored where the shaft's encoder magnet looks through to the board behind
  const upShape = new THREE.Shape();
  upShape.moveTo(-145, FLOOR + 8);
  upShape.lineTo(145, FLOOR + 8);
  upShape.lineTo(145, 148);
  upShape.lineTo(-145, 148);
  upShape.closePath();
  upShape.holes.push(new THREE.Path().absarc(0, 0, 7, 0, Math.PI * 2, true));
  const upGeo = new THREE.ExtrudeGeometry(upShape, {depth: 6, bevelEnabled: false, curveSegments: 32});
  upGeo.translate(0, 0, PLATE_Z - 6);
  upGeo.scale(0.001, 0.001, 0.001);
  const upright = sh(new THREE.Mesh(upGeo, plate));
  stand.add(base, upright);
  // the dial: a ring of ticks every 10°, longer every 30°, a hairline at 0 straight down
  const dial = new THREE.Group();
  for (let a = 0; a < 360; a += 5) {
    const long = a % 30 === 0;
    const len = long ? 12 : a % 10 === 0 ? 7 : 4;
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(mm(long ? 1.6 : 0.9), mm(len)), ink);
    const r = DIAL_R - len / 2;
    tick.position.set(mm(r * Math.sin(a * D2R)), mm(-r * Math.cos(a * D2R)), 0);
    tick.rotation.z = a * D2R;
    dial.add(tick);
  }
  const ringGeo = new THREE.RingGeometry(mm(DIAL_R), mm(DIAL_R + 1), 128);
  dial.add(new THREE.Mesh(ringGeo, ink));
  dial.position.z = mm(PLATE_Z + 0.2);
  stand.add(dial);
  // the command pointer: an accent wedge on the dial where the driver wants the arm to be
  const cmdPtr = new THREE.Group();
  const wedge = new THREE.Shape();
  wedge.moveTo(0, -DIAL_R - 4);
  wedge.lineTo(-5, -DIAL_R - 14);
  wedge.lineTo(5, -DIAL_R - 14);
  wedge.closePath();
  const wg = new THREE.ShapeGeometry(wedge);
  wg.scale(0.001, 0.001, 0.001);
  cmdPtr.add(new THREE.Mesh(wg, accent));
  const line = new THREE.Mesh(new THREE.PlaneGeometry(mm(1.2), mm(DIAL_R - 30)), accent);
  line.position.y = mm(-(DIAL_R + 30) / 2);
  cmdPtr.add(line);
  cmdPtr.position.z = mm(PLATE_Z + 0.5);
  stand.add(cmdPtr);
  // the motor mount: a boss on the plate the stator bolts to, with a bore for the shaft and the encoder
  const boss = sh(new THREE.Mesh(new THREE.CylinderGeometry(mm(16), mm(16), mm(5), 48), alu));
  boss.rotation.x = Math.PI / 2;
  boss.position.z = mm(PLATE_Z + 2.5);
  stand.add(boss);
  root.add(stand);

  // ------------------------------------------------------------ the stator: laminated core, 12 teeth, 12 coils
  const stator = new THREE.Group();
  const coreShape = new THREE.Shape();
  const nT = P.slots;
  // trace the core once round: yoke arc, up a tooth side, the shoe, down the other side
  const yA = Math.asin(ST.tooth / 2 / ST.yoke);
  const sA = ST.shoe / 2 / ST.tip;
  const tipIn = ST.tip - 1.8;
  for (let k = 0; k < nT; k++) {
    const c = (k * 2 * Math.PI) / nT;
    const pt = (r, a) => [r * Math.cos(c + a), r * Math.sin(c + a)];
    const side = (r, s) => {
      // a point on the tooth's straight side at radius r (s = -1 or +1)
      const ang = Math.asin((s * ST.tooth) / 2 / r);
      return pt(r, ang);
    };
    const seq = [side(ST.yoke, -1), side(tipIn, -1), pt(tipIn, -sA), pt(ST.tip, -sA), pt(ST.tip, 0), pt(ST.tip, sA), pt(tipIn, sA), side(tipIn, 1), side(ST.yoke, 1)];
    seq.forEach(([x, y], i) => (k === 0 && i === 0 ? coreShape.moveTo(x, y) : coreShape.lineTo(x, y)));
    // yoke arc to the next tooth
    const a0 = c + yA;
    const a1 = c + (2 * Math.PI) / nT - yA;
    for (let i = 1; i < 5; i++) {
      const a = a0 + ((a1 - a0) * i) / 5;
      coreShape.lineTo(ST.yoke * Math.cos(a), ST.yoke * Math.sin(a));
    }
  }
  coreShape.holes.push(new THREE.Path().absarc(0, 0, ST.hub, 0, Math.PI * 2, true));
  const coreGeo = new THREE.ExtrudeGeometry(coreShape, {depth: ST.stack, bevelEnabled: false, curveSegments: 32});
  coreGeo.translate(0, 0, -ST.stack / 2);
  coreGeo.scale(0.001, 0.001, 0.001);
  stator.add(sh(new THREE.Mesh(coreGeo, lam)));
  // stator hub back to the mount
  const hub = sh(new THREE.Mesh(new THREE.CylinderGeometry(mm(ST.hub + 2), mm(ST.hub + 2), mm(PLATE_Z + 5 + ST.stack / 2) * -1, 32), alu));
  hub.rotation.x = Math.PI / 2;
  hub.position.z = mm((PLATE_Z + 5 - ST.stack / 2) / 2);
  stator.add(hub);
  // coils: a rounded rectangular loop of copper round each tooth
  const coilGeo = (() => {
    const outer = new THREE.Shape();
    const w = 5.4;
    const h = ST.stack + 3.4;
    const r = 1.6;
    const rr = (s, W, H, R) => {
      s.moveTo(-W / 2 + R, -H / 2);
      s.lineTo(W / 2 - R, -H / 2);
      s.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + R);
      s.lineTo(W / 2, H / 2 - R);
      s.quadraticCurveTo(W / 2, H / 2, W / 2 - R, H / 2);
      s.lineTo(-W / 2 + R, H / 2);
      s.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - R);
      s.lineTo(-W / 2, -H / 2 + R);
      s.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + R, -H / 2);
      return s;
    };
    rr(outer, h, w, r);
    outer.holes.push(rr(new THREE.Path(), ST.stack + 0.3, ST.tooth + 0.3, 0.3));
    const len = tipIn - 0.4 - (ST.yoke + 0.6);
    const g = new THREE.ExtrudeGeometry(outer, {depth: len, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 2, curveSegments: 6});
    // the loop's axis along the tooth: extrude runs along z, so turn it onto +x
    g.rotateY(Math.PI / 2);
    g.translate(ST.yoke + 0.6, 0, 0);
    g.scale(0.001, 0.001, 0.001);
    return g;
  })();
  const coils = [];
  for (let k = 0; k < nT; k++) {
    const letter = WINDING[k];
    const mat = std('#8a7a6a', 0.45, 0.7, {emissive: new THREE.Color(NORTH), emissiveIntensity: 0});
    const m = sh(new THREE.Mesh(coilGeo, mat));
    // the box is laid along +x with its long side on z: turn it so the tooth sits inside the loop
    m.rotation.z = (k * 2 * Math.PI) / nT;
    stator.add(m);
    coils.push({mesh: m, mat, phase: PHASE_OF[letter.toUpperCase()], dir: letter === letter.toUpperCase() ? 1 : -1});
  }
  root.add(stator);

  // ------------------------------------------------------------ the rotor: bell, magnets, shaft, arm, weight, encoder magnet
  const rotor = new THREE.Group();
  const spin = new THREE.Group();
  rotor.add(spin);
  const can = sh(new THREE.Mesh(new THREE.CylinderGeometry(mm(BELL.r), mm(BELL.r), mm(BELL.z1 - BELL.z0), 96, 1, true), bellMat));
  can.material.side = THREE.DoubleSide;
  can.rotation.x = Math.PI / 2;
  can.position.z = mm((BELL.z0 + BELL.z1) / 2);
  const canIn = sh(new THREE.Mesh(new THREE.CylinderGeometry(mm(BELL.r - BELL.wall), mm(BELL.r - BELL.wall), mm(BELL.z1 - BELL.z0), 96, 1, true), bellMat));
  canIn.rotation.x = Math.PI / 2;
  canIn.position.z = can.position.z;
  const rim = sh(new THREE.Mesh(new THREE.RingGeometry(mm(BELL.r - BELL.wall), mm(BELL.r), 96), bellMat));
  rim.position.z = mm(BELL.z0);
  rim.rotation.y = Math.PI;
  // the cap with six lightening holes
  const capShape = new THREE.Shape().absarc(0, 0, BELL.r, 0, Math.PI * 2, false);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    capShape.holes.push(new THREE.Path().absarc(14 * Math.cos(a), 14 * Math.sin(a), 3.2, 0, Math.PI * 2, true));
  }
  capShape.holes.push(new THREE.Path().absarc(0, 0, 3, 0, Math.PI * 2, true));
  const capGeo = new THREE.ExtrudeGeometry(capShape, {depth: BELL.cap, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2, curveSegments: 48});
  capGeo.translate(0, 0, BELL.z1);
  capGeo.scale(0.001, 0.001, 0.001);
  const cap = sh(new THREE.Mesh(capGeo, capMat));
  spin.add(can, canIn, rim, cap);
  const magnets = [];
  for (let m = 0; m < P.poles; m++) {
    const a = PHI0 + (m * 2 * Math.PI) / P.poles;
    const n = m % 2 === 0;
    const g = new THREE.BoxGeometry(mm(MAG.r1 - MAG.r0), mm(MAG.w), mm(MAG.len));
    const mag = sh(new THREE.Mesh(g, std(n ? '#c4644a' : '#4f7fbf', 0.45, 0.3)));
    mag.position.set(mm(((MAG.r0 + MAG.r1) / 2) * Math.cos(a)), mm(((MAG.r0 + MAG.r1) / 2) * Math.sin(a)), mm(0.5));
    mag.rotation.z = a;
    spin.add(mag);
    magnets.push(mag);
  }
  const shaft = sh(new THREE.Mesh(new THREE.CylinderGeometry(mm(3), mm(3), mm(BELL.z1 + 5 - (PLATE_Z - 6)), 24), steel));
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = mm((BELL.z1 + 5 + PLATE_Z - 6) / 2);
  spin.add(shaft);
  // the encoder magnet: a diametric disc on the shaft's back end, half north, half south
  const encMag = new THREE.Group();
  for (const [s, col] of [[0, '#c4644a'], [1, '#4f7fbf']]) {
    const half = sh(new THREE.Mesh(new THREE.CylinderGeometry(mm(3), mm(3), mm(2.5), 24, 1, false, s * Math.PI, Math.PI), std(col, 0.45, 0.3)));
    half.rotation.x = Math.PI / 2;
    encMag.add(half);
  }
  encMag.position.z = mm(PLATE_Z - 6 - 1.25);
  spin.add(encMag);
  // the arm, pointing straight down at zero, and the weight on it
  const armShape = new THREE.Shape();
  {
    const w = 4;
    armShape.moveTo(-8, 0);
    armShape.absarc(0, 0, 8, Math.PI, 0, false);
    armShape.lineTo(w, -P.armLen * 1000 + w);
    armShape.absarc(0, -P.armLen * 1000 + w, w, 0, -Math.PI, true);
    armShape.lineTo(-8, 0);
  }
  const armGeo = new THREE.ExtrudeGeometry(armShape, {depth: 3, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2, curveSegments: 24});
  armGeo.scale(0.001, 0.001, 0.001);
  const armMat = ghost(std('#e2e5ea', 0.4, 0.6));
  const arm = sh(new THREE.Mesh(armGeo, armMat));
  arm.position.z = mm(ARM_Z - 1.5);
  const weight = sh(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, mm(20), 48), brass));
  weight.rotation.x = Math.PI / 2;
  weight.position.set(0, -P.armL, mm(ARM_Z + 11.5));
  const bolt = sh(new THREE.Mesh(new THREE.CylinderGeometry(mm(2.4), mm(2.4), mm(28), 6), steel));
  bolt.rotation.x = Math.PI / 2;
  bolt.position.set(0, -P.armL, mm(ARM_Z + 12));
  spin.add(arm, weight, bolt);
  root.add(rotor);

  // ------------------------------------------------------------ the encoder board behind the plate, the driver on the base
  const enc = new THREE.Group();
  const pcb = sh(new THREE.Mesh(new THREE.BoxGeometry(mm(23), mm(23), mm(1.6)), board));
  const ic = sh(new THREE.Mesh(new THREE.BoxGeometry(mm(5), mm(5), mm(1.4)), chip));
  ic.position.z = mm(1.5);
  enc.add(pcb, ic);
  for (let i = 0; i < 4; i++) {
    const pin = sh(new THREE.Mesh(new THREE.CylinderGeometry(mm(0.6), mm(0.6), mm(6), 8), steel));
    pin.position.set(mm(-4.5 + i * 3), mm(-9), mm(-3));
    pin.rotation.x = Math.PI / 2;
    enc.add(pin);
  }
  const ENC_Z = PLATE_Z - 6 - 2.5 - 2.6;
  enc.position.z = mm(ENC_Z);
  root.add(enc);
  // standoffs holding the encoder board to the plate
  for (const [x, y] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
    const so = sh(new THREE.Mesh(new THREE.CylinderGeometry(mm(1.4), mm(1.4), mm(-ENC_Z + PLATE_Z - 6), 8), alu));
    so.rotation.x = Math.PI / 2;
    so.position.set(mm(x), mm(y), mm((ENC_Z + PLATE_Z - 6) / 2));
    enc.add(so);
    so.position.z -= mm(ENC_Z);
  }
  const drv = new THREE.Group();
  const dpcb = sh(new THREE.Mesh(new THREE.BoxGeometry(mm(60), mm(1.6), mm(46)), board));
  drv.add(dpcb);
  for (let i = 0; i < 3; i++) {
    const fet = sh(new THREE.Mesh(new THREE.BoxGeometry(mm(8), mm(3), mm(10)), chip));
    fet.position.set(mm(-16 + i * 16), mm(2.3), mm(8));
    drv.add(fet);
  }
  const mcu = sh(new THREE.Mesh(new THREE.BoxGeometry(mm(12), mm(1.6), mm(12)), chip));
  mcu.position.set(mm(-12), mm(1.6), mm(-10));
  const capC = sh(new THREE.Mesh(new THREE.CylinderGeometry(mm(5), mm(5), mm(14), 24), alu));
  capC.position.set(mm(16), mm(7.8), mm(-10));
  const term = sh(new THREE.Mesh(new THREE.BoxGeometry(mm(24), mm(9), mm(7)), std('#3d7fc9', 0.5, 0.1)));
  term.position.set(mm(0), mm(5.3), mm(19));
  drv.add(mcu, capC, term);
  drv.position.set(mm(60), mm(FLOOR + 8 + 0.8 + 6), mm(-80));
  // legs under the board
  for (const [x, z] of [[-27, -20], [27, -20], [-27, 20], [27, 20]]) {
    const leg = sh(new THREE.Mesh(new THREE.CylinderGeometry(mm(1.6), mm(1.6), mm(6), 8), alu));
    leg.position.set(mm(x), mm(-3.8), mm(z));
    drv.add(leg);
  }
  root.add(drv);
  // wires: three phase leads and four encoder leads, from the back of the plate down to the driver
  const wire = (pts, color, r = 1.1) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(mm(x), mm(y), mm(z))));
    return sh(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, mm(r), 8), std(color, 0.6, 0.1)));
  };
  const dTop = FLOOR + 8 + 0.8 + 6 + 6;
  ['#c7cbd1', '#8e959e', '#e1b04a'].forEach((col, i) => {
    root.add(wire([[-12 + i * 3.4, -14, PLATE_Z - 6], [-14 + i * 3.4, -40, PLATE_Z - 14], [10 + i * 3, dTop + 30, -70], [52 + i * 8 - 8, dTop + 2, -80 + 19]], col));
  });
  ['#d65a5a', '#8e959e', '#59a46a', '#e7e9ec'].forEach((col, i) => {
    root.add(wire([[-4.5 + i * 3, -9, ENC_Z - 6], [-4.5 + i * 3, -30, ENC_Z - 14], [40 + i * 4, dTop + 26, -96], [48 + i * 4, dTop + 1.6, -96]], col, 0.7));
  });

  // ------------------------------------------------------------ posing
  const cN = new THREE.Color(NORTH);
  const cS = new THREE.Color(SOUTH);
  let lastMass = -1;
  const smooth = (x) => {
    const u = Math.min(1, Math.max(0, x));
    return u * u * (3 - 2 * u);
  };
  /**
   * r: {deg, cmd, ph: [ia, ib, ic], mass kg}. ops: xray 0..1 fades the bell to glass; explode 0..1 pulls the rotor
   * forward and the encoder board back.
   */
  const update = (r, {xray = 0, explode = 0} = {}) => {
    spin.rotation.z = r.deg * D2R;
    cmdPtr.rotation.z = r.cmd * D2R;
    for (const c of coils) {
      const i = r.ph[c.phase] * c.dir;
      c.mat.emissive.copy(i >= 0 ? cN : cS);
      c.mat.emissiveIntensity = Math.min(0.9, (Math.abs(i) / 1.5) * 0.95);
    }
    if (r.mass !== lastMass) {
      lastMass = r.mass;
      // a brass disc 20 mm thick: radius from its mass (density 8.5 g/cm³), never smaller than the bolt's washer
      const rad = Math.max(4, Math.sqrt((Math.max(r.mass, 0.001) / 8500 / 0.02) / Math.PI) * 1000);
      weight.scale.set(mm(rad), 1, mm(rad));
      weight.visible = r.mass > 0.002;
    }
    const op = 1 - 0.93 * smooth(xray);
    for (const m of [bellMat, capMat]) {
      m.opacity = op;
      m.depthWrite = op > 0.99;
    }
    // the arm goes faint too, so the coils behind it read
    armMat.opacity = 1 - 0.7 * smooth(xray);
    armMat.depthWrite = armMat.opacity > 0.99;
    const e = smooth(explode);
    rotor.position.z = mm(55 * e);
    enc.position.z = mm(ENC_Z - 30 * e);
  };
  return {root, update, parts: {stator, rotor, spin, enc, drv, cmdPtr, coils, magnets, weight}, ENC_Z: mm(ENC_Z)};
}
