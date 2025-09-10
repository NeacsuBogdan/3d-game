'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { loadCharacter, type LoadedCharacter } from '@/lib/3d/loadCharacter';

const CHAR_IDS = ['boss', 'jolleen', 'medic', 'rani'] as const;
type CharacterId = typeof CHAR_IDS[number];
const isCharacterId = (v: string): v is CharacterId =>
  (CHAR_IDS as readonly string[]).includes(v);

/**
 * Scales the model to a target height, drops feet to y=0, recenters,
 * frames the camera, and constrains OrbitControls so the user can’t “lose” it.
 */
function fitModelAndCamera(
  model: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  targetHeight = 1.7 // meters-ish; tweak if you want them smaller/larger
) {
  // 1) measure current bounds
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // if height is oddly zero, bail
  if (size.y <= 0.0001) return;

  // 2) scale to target height
  const scale = targetHeight / size.y;
  model.scale.multiplyScalar(scale);

  // 3) recompute bounds after scaling
  const box2 = new THREE.Box3().setFromObject(model);
  const size2 = new THREE.Vector3();
  const center2 = new THREE.Vector3();
  box2.getSize(size2);
  box2.getCenter(center2);

  // 4) put feet on the ground (y = 0)
  const shiftY = -box2.min.y;
  model.position.y += shiftY;

  // 5) set a nice orbit target around chest height
  const target = new THREE.Vector3(center2.x, size2.y * 0.6, center2.z);
  controls.target.copy(target);

  // 6) frame camera to fit the whole body comfortably
  const halfFovY = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const radius = 0.5 * Math.max(size2.x, size2.z, size2.y);
  const distance = (radius * 2) / Math.tan(halfFovY); // a bit wider than exact fit

  // keep camera direction, just set distance from target
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  camera.position.copy(dir.multiplyScalar(distance).add(controls.target));

  // Keep near/far sensible for the new scale
  camera.near = Math.max(0.01, radius / 50);
  camera.far = Math.max(50, radius * 100);
  camera.updateProjectionMatrix();

  // 7) clamp zoom so you can’t zoom too far in/out
  controls.minDistance = distance * 0.35;
  controls.maxDistance = distance * 3.0;
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49; // don’t go under the ground
  controls.minPolarAngle = Math.PI * 0.05;

  controls.update();
}

export default function Debug3DPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [charId, setCharId] = useState<CharacterId>('boss');
  const loadedRef = useRef<LoadedCharacter | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0e12);

    // camera
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 1.4, 3);

    // renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    el.appendChild(renderer.domElement);

    // lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(2, 3, 2);
    scene.add(dir);

    // ground disk
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.5, 64),
      new THREE.MeshStandardMaterial({ metalness: 0, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);

    // controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // resize
    const resize = () => {
      const { clientWidth, clientHeight } = el;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // load + fit
    let stop = false;
    (async () => {
      const loaded = await loadCharacter(scene, charId);
      if (stop) return;
      loadedRef.current = loaded;

      // fit the first time we load
      fitModelAndCamera(loaded.model, camera, controls, 1.6); // slightly smaller if you want
    })();

    // render loop
    const clock = new THREE.Clock();
    const loop = () => {
      if (stop) return;
      const dt = clock.getDelta();
      loadedRef.current?.mixer.update(dt);
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    loop();

    return () => {
      stop = true;
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      loadedRef.current = null;
    };
  }, [charId]);

const play = (name: keyof LoadedCharacter['clips']) => {
  const loaded = loadedRef.current;
  if (!loaded || !loaded.clips[name]) return;
  if (name === 'idle' || name === 'sit_idle') loaded.fadeToLoop(name, 0.3);
  else loaded.fadeToOnce(name, 0.25, 'idle');
};

  return (
    <div className="h-screen w-screen flex flex-col">
      <div className="p-3 border-b border-neutral-800 flex items-center gap-3">
        <span className="font-semibold">3D Debug</span>
        <select
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
          value={charId}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            const v = e.target.value;
            if (isCharacterId(v)) setCharId(v);
          }}
        >
          {CHAR_IDS.map((id) => (
            <option key={id} value={id}>
              {id.charAt(0).toUpperCase() + id.slice(1)}
            </option>
          ))}
        </select>
        <div className="flex gap-2 ml-4">
          <button className="px-2 py-1 bg-neutral-800 rounded" onClick={() => play('idle')}>idle</button>
          <button className="px-2 py-1 bg-neutral-800 rounded" onClick={() => play('sit_idle')}>sit_idle</button>

          {/* one-shots */}
          <button className="px-2 py-1 bg-neutral-800 rounded" onClick={() => play('point')}>point</button>
          <button className="px-2 py-1 bg-neutral-800 rounded" onClick={() => play('win')}>win</button>
          <button className="px-2 py-1 bg-neutral-800 rounded" onClick={() => play('fail')}>fail</button>
          <button className="px-2 py-1 bg-neutral-800 rounded" onClick={() => play('wave')}>wave</button>

          {/* explicit transitions */}
          <button className="px-2 py-1 bg-neutral-800 rounded" onClick={() => loadedRef.current?.sitDown()}>sit (down)</button>
          <button className="px-2 py-1 bg-neutral-800 rounded" onClick={() => loadedRef.current?.standUp()}>stand_up</button>
        </div>
      </div>
      <div ref={mountRef} className="flex-1" />
    </div>
  );
}
