// The pump, built from code in metres from kin.js's millimetres: the figure-eight body with its two port slots, the front
// and back covers with their bolts, two involute gears on their shafts, and the oil in every tooth space, coloured from
// inlet blue to outlet orange as the space carries it round. update(deg, ops) poses everything from the shaft angle.
import * as THREE from 'three';
import {a, gearAngles, gearOutline, P, ra, spaceProgress} from './kin.js';

const mm = (v) => v * 0.001;
export const ACCENT = '#ff7a2f';
export const INLET = '#4f9cf0';
export const OUTLET = ACCENT;
// housing half extents (mm): the bore plus a 12 mm wall at the sides, the ports run through top and bottom
export const HW = a / 2 + ra + 12;
export const HH = ra + 22;
const COVER = 10; // cover thickness, mm
const PORT = 6; // port slot half width, mm
const SHAFT_R = 8;
const BORE = ra + P.clear;

const roundedRect = (shape, w, h, r) => {
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  return shape;
};

// the cavity: the union of the two bores and the two port slots, traced once round as a hole
function cavityPath() {
  const path = new THREE.Path();
  const c = a / 2;
  const yOn = Math.sqrt(BORE * BORE - (c - PORT) ** 2); // where a slot wall meets a bore
  const angR = Math.atan2(yOn, PORT - c); // on the right bore, seen from its centre
  path.moveTo(PORT, HH + 1);
  path.lineTo(PORT, yOn);
  path.absarc(c, 0, BORE, angR, -angR, true);
  path.lineTo(PORT, -HH - 1);
  path.lineTo(-PORT, -HH - 1);
  path.lineTo(-PORT, -yOn);
  path.absarc(-c, 0, BORE, Math.PI + angR, Math.PI - angR, true);
  path.lineTo(-PORT, HH + 1);
  path.lineTo(PORT, HH + 1);
  return path;
}

export function buildMachine() {
  const root = new THREE.Group();
  const shadowed = (m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const shellMat = () => new THREE.MeshStandardMaterial({color: '#a9b1bb', roughness: 0.5, metalness: 0.55, envMapIntensity: 0.6, transparent: true, opacity: 1});
  const bodyMat = shellMat();
  const frontMat = shellMat();
  const backMat = shellMat();
  const steel = new THREE.MeshStandardMaterial({color: '#d4d8de', roughness: 0.32, metalness: 0.9, envMapIntensity: 0.7});
  const dark = new THREE.MeshStandardMaterial({color: '#5a606a', roughness: 0.5, metalness: 0.6});
  const accent = new THREE.MeshStandardMaterial({color: ACCENT, roughness: 0.45, metalness: 0.2});

  // body: the outer block with the cavity through it, z from -b/2 to b/2
  const bodyShape = roundedRect(new THREE.Shape(), HW, HH, 6);
  bodyShape.holes.push(cavityPath());
  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {depth: P.b, bevelEnabled: false, curveSegments: 48});
  bodyGeo.translate(0, 0, -P.b / 2);
  bodyGeo.scale(0.001, 0.001, 0.001);
  const body = shadowed(new THREE.Mesh(bodyGeo, bodyMat));
  root.add(body);

  // covers: the same outline, the front one bored for the drive shaft; four bolts each
  const cover = (mat, front) => {
    const s = roundedRect(new THREE.Shape(), HW, HH, 6);
    if (front) s.holes.push(new THREE.Path().absarc(-a / 2, 0, SHAFT_R + 0.5, 0, Math.PI * 2, false));
    const g = new THREE.ExtrudeGeometry(s, {depth: COVER, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 2, curveSegments: 32});
    g.translate(0, 0, front ? P.b / 2 : -P.b / 2 - COVER);
    g.scale(0.001, 0.001, 0.001);
    const grp = new THREE.Group();
    grp.add(shadowed(new THREE.Mesh(g, mat)));
    for (const [x, y] of [[-HW + 8, -HH + 8], [HW - 8, -HH + 8], [-HW + 8, HH - 8], [HW - 8, HH - 8]]) {
      const bolt = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(mm(4.2), mm(4.2), mm(4), 6), dark));
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(mm(x), mm(y), mm(front ? P.b / 2 + COVER + 2 + 1 : -P.b / 2 - COVER - 2 - 1));
      grp.add(bolt);
    }
    return grp;
  };
  const front = cover(frontMat, true);
  const back = cover(backMat, false);
  root.add(front, back);

  // ports: a pipe stub and flange top and bottom, and the oil standing in each slot
  const ports = new THREE.Group();
  for (const [sgn, col] of [[-1, INLET], [1, OUTLET]]) {
    const pipe = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(mm(9), mm(9), mm(16), 32, 1, true), steel));
    pipe.position.y = mm(sgn * (HH + 8));
    const flange = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(mm(14), mm(14), mm(4), 32), steel));
    flange.position.y = mm(sgn * (HH + 16));
    const oil = new THREE.Mesh(
      new THREE.BoxGeometry(mm(PORT * 2 - 0.4), mm(HH - 12), mm(P.b - 0.8)),
      new THREE.MeshStandardMaterial({color: col, roughness: 0.25, metalness: 0, emissive: col, emissiveIntensity: 0.25}),
    );
    oil.position.y = mm(sgn * (HH / 2 + 7));
    ports.add(pipe, flange, oil);
  }
  root.add(ports);

  // the gears: one extruded involute outline each, a shaft through it, and twelve oil pockets riding with it
  const outline = gearOutline();
  const gearShape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  gearShape.holes.push(new THREE.Path().absarc(0, 0, SHAFT_R - 0.2, 0, Math.PI * 2, true));
  const gearGeo = new THREE.ExtrudeGeometry(gearShape, {depth: P.b - 0.6, bevelEnabled: false, curveSegments: 24});
  gearGeo.translate(0, 0, -(P.b - 0.6) / 2);
  gearGeo.scale(0.001, 0.001, 0.001);
  gearGeo.computeVertexNormals();

  // a tooth space as a closed outline: down the trailing flank of tooth k, along the root, up the leading flank of k+1,
  // back along the tip circle; pulled 0.2 mm toward its middle so its walls never fight the gear's
  const spaceGeo = (() => {
    const pts = [];
    for (let i = 15; i <= 29; i++) pts.push(outline[i]);
    for (let i = 30; i <= 41; i++) pts.push(outline[i % outline.length]);
    const tipA = Math.atan2(pts[pts.length - 1][1], pts[pts.length - 1][0]);
    const tipB = Math.atan2(pts[0][1], pts[0][0]);
    for (let i = 1; i < 4; i++) {
      const ang = tipA + ((tipB - tipA) * i) / 4;
      pts.push([ra * Math.cos(ang), ra * Math.sin(ang)]);
    }
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const shape = new THREE.Shape(pts.map(([x, y]) => {
      const d = Math.hypot(x - cx, y - cy) || 1;
      return new THREE.Vector2(x - ((x - cx) / d) * 0.2, y - ((y - cy) / d) * 0.2);
    }));
    const g = new THREE.ExtrudeGeometry(shape, {depth: P.b - 1.6, bevelEnabled: false});
    g.translate(0, 0, -(P.b - 1.6) / 2);
    g.scale(0.001, 0.001, 0.001);
    return g;
  })();

  const gears = [];
  const pockets = [];
  for (const side of [0, 1]) {
    const g = new THREE.Group();
    g.position.x = mm(side === 0 ? -a / 2 : a / 2);
    const spin = new THREE.Group();
    spin.add(shadowed(new THREE.Mesh(gearGeo, steel)));
    // the drive shaft runs from inside the back cover out through the front one; the idler stays inside both
    const len = side === 0 ? 71 : 36;
    const shaft = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(mm(SHAFT_R), mm(SHAFT_R), mm(len), 32), steel));
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = mm(side === 0 ? len / 2 - 19 : 0);
    spin.add(shaft);
    if (side === 0) {
      // the drive key: the accent on the shaft that brings the power in
      const key = shadowed(new THREE.Mesh(new THREE.BoxGeometry(mm(4), mm(3), mm(18)), accent));
      key.position.set(0, mm(SHAFT_R + 0.8), mm(42));
      spin.add(key);
    }
    for (let k = 0; k < P.z; k++) {
      const mat = new THREE.MeshStandardMaterial({color: INLET, roughness: 0.25, metalness: 0, emissive: INLET, emissiveIntensity: 0.2, transparent: true, opacity: 0});
      const m = new THREE.Mesh(spaceGeo, mat);
      m.rotation.z = k * ((2 * Math.PI) / P.z);
      spin.add(m);
      pockets.push({side, k, mesh: m, mat});
    }
    g.add(spin);
    root.add(g);
    gears.push(spin);
  }

  const cIn = new THREE.Color(INLET);
  const cOut = new THREE.Color(OUTLET);
  const smooth = (e0, e1, x) => {
    const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return u * u * (3 - 2 * u);
  };
  /** ops: open 0..1 slides the front cover off toward the viewer, glass 0..1 turns the shell to faint tinted glass. */
  const update = (deg, {open = 0, glass = 0} = {}) => {
    const ang = gearAngles(deg);
    gears[0].rotation.z = ang.drive;
    gears[1].rotation.z = ang.idler;
    for (const p of pockets) {
      const s = spaceProgress(deg, p.side, p.k);
      // inlet blue the whole way round, switching to outlet orange as the space seals up against the mesh; a straight
      // switch with a brief dip, since a blend of the two passes through lilac
      const c = smooth(0.88, 0.96, Math.max(0, s));
      p.mat.opacity = s < 0 ? 0 : Math.min(1, s * 12, (1 - s) * 12) * 0.95 * (1 - 0.85 * Math.sin(Math.PI * c));
      p.mesh.visible = s >= 0;
      p.mat.color.copy(c < 0.5 ? cIn : cOut);
      p.mat.emissive.copy(p.mat.color);
    }
    front.position.z = mm(70 * smooth(0, 1, open));
    const shellOpacity = 1 - 0.84 * glass;
    for (const m of [bodyMat, backMat]) {
      m.opacity = shellOpacity;
      m.depthWrite = shellOpacity > 0.99;
      m.color.set(glass > 0.5 ? '#9fc4e8' : '#a9b1bb');
    }
    frontMat.opacity = Math.min(shellOpacity, 1 - smooth(0.45, 1, open));
    frontMat.depthWrite = frontMat.opacity > 0.99;
    front.visible = frontMat.opacity > 0.01;
    frontMat.color.copy(bodyMat.color);
  };
  return {root, update, parts: {body, front, back, gears, ports}};
}
