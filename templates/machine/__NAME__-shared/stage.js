// The studio: a pale backdrop, a soft studio environment for the metal, one shadow-casting light, a shadow-only floor.
// frame(deg, cam, ops) poses the machine and draws one frame.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {buildMachine} from './machine.js';

export const BG = '#eceef0';

export function createStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.01, 20);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4}));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());

  // a bright room for the metal to reflect: one big top softbox and a side strip
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#d9dadd');
    const box = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(k, k, k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(12, 12, new THREE.Vector3(0, 14, 2), 2.6);
    box(3, 14, new THREE.Vector3(-12, 4, 6), 3);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    pm.dispose();
  }
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(-0.6, 1.6, 0.8);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {left: -0.3, right: 0.3, top: 0.3, bottom: -0.3, near: 0.2, far: 4});
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target, new THREE.HemisphereLight('#ffffff', '#cfd0d3', 0.8));

  // a shadow catcher just under the crank; polygonOffset keeps its depth test inside the composer's target
  const FLOOR_Y = -0.05;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.ShadowMaterial({color: '#5d636c', opacity: 0.25, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);

  const machine = buildMachine();
  scene.add(machine.root);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    Object.assign(size, {w, h});
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  // cam: target (tx, ty, tz) in metres, azimuth from +z toward +x and elevation in radians, distance d, sx/sy a screen
  // shift in px (moves the machine clear of the panels)
  const frame = (deg, cam, ops = {}) => {
    machine.update(deg, ops);
    const {tx, ty, tz, az, el, d} = cam;
    camera.position.set(tx + d * Math.cos(el) * Math.sin(az), ty + d * Math.sin(el), tz + d * Math.cos(el) * Math.cos(az));
    camera.lookAt(tx, ty, tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    composer.render();
  };
  const pv = new THREE.Vector3();
  /** World point (metres) → [x, y] in the 1600 x 900 layout, or null behind the camera. */
  const project = (x, y, z) => {
    pv.set(x, y, z).project(camera);
    return pv.z > 1 ? null : [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  /** Quality tiers for the live page: MSAA samples and shadow map size. */
  const setQuality = ({samples, shadow}) => {
    if (samples !== undefined)
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = samples;
        t.dispose();
      }
    if (shadow !== undefined) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  };
  return {renderer, scene, camera, composer, machine, resize, frame, project, setQuality, size};
}
