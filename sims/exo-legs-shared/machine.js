// The exoskeleton, built from code in metres: a hip frame with belt, battery and controller on the back, and per leg a
// hip actuator, a telescopic thigh link with its cuff, a knee actuator, a shank link with its cuff, and a passive ankle
// with a footplate. The user's legs ride inside as a faint ghost. update(pose, ops) poses both legs from their joint
// angles; ops.explode (0..1) pulls every part out along its own direction for the exploded view.
import * as THREE from 'three';
import {SEG} from './kin.js';

export const ACCENT = '#ff7a2f';
const OUT = 0.085; // lateral offset of the exo links from the leg's centre line, m

/** Bill of materials: one row per part kind; the per-leg parts count twice. Masses in kg, design estimates. */
export const PARTS = [
  {id: 'hipAct', name: 'Hip actuator', qty: 2, mass: 1.1, what: 'BLDC + harmonic drive 1:100, encoder'},
  {id: 'kneeAct', name: 'Knee actuator', qty: 2, mass: 0.9, what: 'BLDC + harmonic drive 1:100, encoder'},
  {id: 'thighLink', name: 'Thigh link', qty: 2, mass: 0.75, what: '7075-T6 aluminium, telescopic ±40 mm'},
  {id: 'shankLink', name: 'Shank link', qty: 2, mass: 0.55, what: '7075-T6 aluminium, telescopic ±40 mm'},
  {id: 'thighCuff', name: 'Thigh cuff + strap', qty: 2, mass: 0.35, what: 'carbon shell, foam liner, Velcro'},
  {id: 'shankCuff', name: 'Shank cuff + strap', qty: 2, mass: 0.3, what: 'carbon shell, foam liner, Velcro'},
  {id: 'ankle', name: 'Ankle-foot plate', qty: 2, mass: 0.6, what: 'passive hinge, dorsiflex spring, footplate'},
  {id: 'frame', name: 'Hip frame + belt', qty: 1, mass: 1.6, what: 'aluminium frame, padded belt, width adjust'},
  {id: 'battery', name: 'Battery pack', qty: 1, mass: 1.3, what: '33.3 V Li-ion, 159 Wh, hot-swap'},
  {id: 'ctrl', name: 'Controller + IMU', qty: 1, mass: 0.5, what: 'motor drivers, 9-axis IMU, e-stop'},
];
export const TOTAL_MASS = PARTS.reduce((s, p) => s + p.qty * p.mass, 0);

export function buildMachine() {
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  root.add(pelvis);
  const shadowed = (m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const alu = new THREE.MeshStandardMaterial({color: '#c9ced5', roughness: 0.35, metalness: 0.75, envMapIntensity: 0.7});
  const carbon = new THREE.MeshStandardMaterial({color: '#4b515a', roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide});
  const strap = new THREE.MeshStandardMaterial({color: '#5a606a', roughness: 0.8, metalness: 0});
  const accent = new THREE.MeshStandardMaterial({color: ACCENT, roughness: 0.42, metalness: 0.25});
  const ghost = new THREE.MeshStandardMaterial({color: '#8fb4d9', roughness: 0.6, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false});

  // every exo part remembers its rest position and the direction it leaves along in the exploded view
  const parts = [];
  const named = {};
  const part = (mesh, parent, id, pos, out) => {
    shadowed(mesh);
    mesh.position.set(...pos);
    parent.add(mesh);
    parts.push({mesh, rest: mesh.position.clone(), out: new THREE.Vector3(...out)});
    (named[id] ??= []).push(mesh);
    return mesh;
  };
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const cyl = (r, h, mat, seg = 32) => {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    g.rotateX(Math.PI / 2); // axis along z, the joint axis
    return new THREE.Mesh(g, mat);
  };
  // a cuff: a shell wrapped round the front of the limb, open at the back where the strap closes it
  const cuff = (r, h) => {
    const g = new THREE.CylinderGeometry(r, r, h, 40, 1, true, -Math.PI * 0.62, Math.PI * 1.24);
    g.rotateY(Math.PI / 2); // open side to the back (-x)
    return new THREE.Mesh(g, carbon);
  };
  const capsule = (r, len) => {
    const g = new THREE.CapsuleGeometry(r, len, 8, 20);
    g.translate(0, -len / 2, 0);
    return new THREE.Mesh(g, ghost);
  };

  // ------------------------------------------------------------ the hip frame on the back
  {
    const beltGeo = new THREE.TorusGeometry(SEG.hipHalf + OUT + 0.01, 0.018, 12, 48, Math.PI);
    beltGeo.rotateX(Math.PI / 2);
    beltGeo.rotateY(-Math.PI / 2); // the half ring runs round the back, ends at the two hip actuators
    part(new THREE.Mesh(beltGeo, alu), pelvis, 'frame', [0, 0.02, 0], [-0.16, 0, 0]);
    part(box(0.03, 0.16, 0.22, carbon), pelvis, 'frame', [-(SEG.hipHalf + OUT) - 0.01, 0.07, 0], [-0.2, 0, 0]);
    part(box(0.07, 0.2, 0.17, strap), pelvis, 'battery', [-(SEG.hipHalf + OUT) - 0.06, 0.12, 0], [-0.34, 0.12, 0]);
    part(box(0.045, 0.09, 0.14, accent), pelvis, 'ctrl', [-(SEG.hipHalf + OUT) - 0.05, 0.27, 0], [-0.3, 0.34, 0]);
    const pelvisGhost = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.12, 8, 20), ghost);
    pelvisGhost.rotation.x = Math.PI / 2;
    pelvisGhost.scale.set(0.85, 1, 0.7);
    pelvisGhost.position.y = 0.06;
    pelvis.add(pelvisGhost);
  }

  // ------------------------------------------------------------ the legs: hip → knee → ankle groups
  const legs = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.z = s * SEG.hipHalf;
    pelvis.add(hip);
    const knee = new THREE.Group();
    knee.position.y = -SEG.thigh;
    hip.add(knee);
    const ankle = new THREE.Group();
    ankle.position.y = -SEG.shank;
    knee.add(ankle);
    const z = s * OUT;
    const ghosts = [capsule(0.068, SEG.thigh), capsule(0.05, SEG.shank)];
    hip.add(ghosts[0]);
    knee.add(ghosts[1]);
    const footGhost = new THREE.Mesh(new THREE.BoxGeometry(SEG.foot, SEG.ankleH, 0.09), ghost);
    footGhost.position.set(0.25 * SEG.foot, -SEG.ankleH / 2, 0);
    ankle.add(footGhost);
    ghosts.push(footGhost);

    // hip: actuator on the joint axis, a two-part telescopic thigh link, the thigh cuff
    part(cyl(0.048, 0.055, accent), hip, 'hipAct', [0, 0, z + s * 0.01], [0, 0.02, s * 0.2]);
    part(box(0.04, 0.2, 0.018, alu), hip, 'thighLink', [0, -0.12, z], [0, 0.03, s * 0.13]);
    part(box(0.032, 0.2, 0.014, alu), hip, 'thighLink', [0, -0.29, z], [0, -0.03, s * 0.13]);
    part(cuff(0.074, 0.11), hip, 'thighCuff', [0, -0.21, 0], [0.16, 0, 0]);
    part(box(0.006, 0.035, 0.15, strap), hip, 'thighCuff', [-0.074, -0.21, 0], [-0.1, 0, 0]);
    // knee: actuator, shank link, shank cuff
    part(cyl(0.042, 0.05, accent), knee, 'kneeAct', [0, 0, z + s * 0.01], [0, 0, s * 0.2]);
    part(box(0.034, 0.34, 0.016, alu), knee, 'shankLink', [0, -0.19, z], [0, -0.02, s * 0.13]);
    part(cuff(0.058, 0.1), knee, 'shankCuff', [0, -0.16, 0], [0.15, 0, 0]);
    part(box(0.006, 0.03, 0.12, strap), knee, 'shankCuff', [-0.058, -0.16, 0], [-0.1, 0, 0]);
    // ankle: passive hinge, a strut down the outside, the footplate under the shoe
    part(cyl(0.024, 0.03, strap), ankle, 'ankle', [0, 0, z], [0, 0, s * 0.16]);
    part(box(0.022, SEG.ankleH, 0.01, alu), ankle, 'ankle', [0, -SEG.ankleH / 2, z], [0, -0.04, s * 0.12]);
    part(box(SEG.foot, 0.008, 0.11, carbon), ankle, 'ankle', [0.25 * SEG.foot, -SEG.ankleH + 0.004, 0], [0, -0.14, 0]);
    legs.push({s, hip, knee, ankle, ghosts});
  }

  const D2R = Math.PI / 180;
  const tmp = new THREE.Vector3();
  /** pose: {hipY, left: {hip, knee, ankle}, right: {...}} in metres and degrees. ops.explode 0..1. */
  const update = (pose, {explode = 0} = {}) => {
    pelvis.position.y = pose.hipY;
    for (const leg of legs) {
      const a = leg.s > 0 ? pose.left : pose.right;
      leg.hip.rotation.z = a.hip * D2R;
      leg.knee.rotation.z = -a.knee * D2R;
      leg.ankle.rotation.z = a.ankle * D2R;
      leg.hip.position.z = leg.s * (SEG.hipHalf + 0.12 * explode);
      for (const g of leg.ghosts) g.visible = explode < 0.98;
    }
    ghost.opacity = 0.1 * (1 - explode);
    for (const p of parts) p.mesh.position.copy(p.rest).addScaledVector(p.out, explode);
  };
  /** World position of a named part (the first mesh of that kind on the left leg), for callouts. */
  const where = (id) => {
    const m = named[id]?.[0];
    if (!m) return null;
    m.updateWorldMatrix(true, false);
    return m.getWorldPosition(tmp).toArray();
  };
  return {root, update, where, parts: named};
}
