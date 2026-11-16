// The geometry, built from code in metres from kin.js's millimetres. update(deg, ops) poses every part from the one
// input. REPLACE the parts with your machine's; keep every dimension coming from P.
import * as THREE from 'three';
import {crankPin, P, pinY, R, rodLean} from './kin.js';

const mm = (v) => v * 0.001;
export const ACCENT = '#ff3d55';

export function buildMachine() {
  const root = new THREE.Group();
  const metal = (color, rough = 0.5) => new THREE.MeshStandardMaterial({color, roughness: rough, metalness: 0.6, envMapIntensity: 0.5});
  const steel = metal('#9aa1a9');
  const dark = metal('#5a606a', 0.55);
  const accent = new THREE.MeshStandardMaterial({color: ACCENT, roughness: 0.45, metalness: 0.2});
  const shadowed = (m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const alongZ = (g) => g.rotateX(Math.PI / 2);

  // crankshaft: main journal, one web, the crank pin (all on the z axis)
  root.add(shadowed(new THREE.Mesh(alongZ(new THREE.CylinderGeometry(mm(10), mm(10), mm(70), 32)), steel)));
  const crank = new THREE.Group();
  const web = shadowed(new THREE.Mesh(alongZ(new THREE.CylinderGeometry(mm(R + 14), mm(R + 14), mm(10), 48)), dark));
  web.position.z = mm(-14);
  const pin = shadowed(new THREE.Mesh(alongZ(new THREE.CylinderGeometry(mm(8), mm(8), mm(26), 24)), steel));
  pin.position.set(0, mm(R), mm(-2));
  crank.add(web, pin);
  root.add(crank);

  // connecting rod: a bar from the crank pin to the piston pin, pivoting at the big end
  const rod = new THREE.Group();
  const bar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(mm(12), mm(P.rod), mm(9)), steel));
  bar.position.y = mm(P.rod / 2);
  rod.add(bar);
  root.add(rod);

  // piston: the part doing the work, in the accent colour
  const piston = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(mm(P.bore / 2 - 0.5), mm(P.bore / 2 - 0.5), mm(P.pistonH), 48), accent));
  root.add(piston);

  // cylinder: an open sleeve covering the whole stroke; 'glass' shows the piston through it, 'solid' hides it
  const top = R + P.rod + P.pistonH - P.pinDrop + 4;
  const bottom = -R + P.rod - P.pinDrop - 6;
  const sleeveMat = new THREE.MeshStandardMaterial({color: '#c9ced4', roughness: 0.3, metalness: 0.1, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: true});
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(mm(P.bore / 2 + 4), mm(P.bore / 2 + 4), mm(top - bottom), 64, 1, true), sleeveMat);
  sleeve.position.y = mm((top + bottom) / 2);
  sleeve.castShadow = true;
  root.add(sleeve);

  const update = (deg, {cut = 'solid'} = {}) => {
    crank.rotation.z = -deg * (Math.PI / 180);
    const [x, y] = crankPin(deg);
    rod.position.set(mm(x), mm(y), mm(-2));
    rod.rotation.z = rodLean(deg);
    piston.position.y = mm(pinY(deg) - P.pinDrop + P.pistonH / 2);
    const glass = cut === 'glass';
    sleeveMat.opacity = glass ? 0.16 : 1;
    sleeveMat.depthWrite = !glass;
  };
  return {root, update, parts: {crank, rod, piston, sleeve}};
}
