"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three-stdlib";

export type StageMember = {
  uid: string;
  seat_index: number;
  display_name: string;
  character_id: string | null;
  is_ready: boolean;
};

type Props = {
  members: StageMember[];
  currentUid: string | null;
  onClickMember: (uid: string) => void;
};

// helpers: paths
const basePathFor = (charId: string) => `/models/${charId}/base.fbx`;
const sitIdlePathFor = (charId: string) => `/models/${charId}/anims/sit_idle.fbx`;

export default function Stage3D({ members, currentUid, onClickMember }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const clockRef = useRef(new THREE.Clock());

  // keyed by uid
  const mixersRef = useRef<Map<string, THREE.AnimationMixer>>(new Map());
  const nodesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const labelsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  // init / teardown
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;

    if (!container || !canvas) return;

    // base scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / 360,
      0.1,
      100
    );
    camera.position.set(0, 1.8, 4.2);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, 360);

    // lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2, 5, 3);
    scene.add(ambient, dir);

    // ground
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 64),
      new THREE.MeshStandardMaterial({
        color: 0x111111,
        metalness: 0.1,
        roughness: 0.9,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const onResize = () => {
      const c = containerRef.current;
      const r = rendererRef.current;
      const cam = cameraRef.current;
      if (!c || !r || !cam) return;
      r.setSize(c.clientWidth, 360);
      cam.aspect = c.clientWidth / 360;
      cam.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    const onPointer = (e: PointerEvent) => {
      const r = rendererRef.current;
      const cam = cameraRef.current;
      if (!r || !cam) return;
      const rect = r.domElement.getBoundingClientRect();
      pointerRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const ray = raycasterRef.current;
      ray.setFromCamera(pointerRef.current, cam);

      const roots = Array.from(nodesRef.current.values());
      if (!roots.length) return;
      const intersects = ray.intersectObjects(roots, true);
      if (intersects.length) {
        // urcă până la root cu userData.uid
        let obj: THREE.Object3D | null = intersects[0].object;
        while (obj && !obj.userData?.uid) obj = obj.parent;
        if (obj?.userData?.uid) onClickMember(String(obj.userData.uid));
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointer);

    // capture stable refs for cleanup warnings
    const mixers = mixersRef.current;
    const nodes = nodesRef.current;
    const labels = labelsRef.current;

    let raf = 0;
    const animate = () => {
      const dt = clockRef.current.getDelta();
      mixers.forEach((m) => m.update(dt));

      // update label screen positions
      const cam = cameraRef.current;
      const rend = rendererRef.current;
      const overlay = overlayRef.current;
      if (cam && rend && overlay) {
        labels.forEach((label, uid) => {
          const root = nodes.get(uid);
          if (!root) return;
          const pos = new THREE.Vector3();
          root.getWorldPosition(pos);
          pos.y += 1.9;
          pos.project(cam);
          const x = (pos.x * 0.5 + 0.5) * rend.domElement.clientWidth;
          const y = (-pos.y * 0.5 + 0.5) * rend.domElement.clientHeight;
          label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
          label.style.opacity = pos.z < 1 ? "1" : "0";
        });
      }

      if (sceneRef.current && cameraRef.current && rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointer);

      mixers.forEach((m) => m.stopAllAction());
      mixers.clear();

      nodes.forEach((node) => {
        scene.remove(node);
      });
      nodes.clear();

      labels.forEach((el) => el.remove());
      labels.clear();

      renderer.dispose();
      // scene dispose optional (not all objects implement)
      (scene as unknown as { dispose?: () => void }).dispose?.();

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, [onClickMember]);

  // reconcile models & labels when members change
  useEffect(() => {
    const scene = sceneRef.current;
    const overlay = overlayRef.current;
    if (!scene || !overlay) return;

    const loader = new FBXLoader();

    // create/update one member visuals
    const ensureMember = async (
      m: StageMember,
      indexInCircle: number,
      count: number
    ) => {
      const R = 2.2;
      const theta = (2 * Math.PI * indexInCircle) / Math.max(count, 1);
      const x = R * Math.cos(theta);
      const z = R * Math.sin(theta);

      let root = nodesRef.current.get(m.uid);
      if (!root) {
        root = new THREE.Group();
        root.userData.uid = m.uid;
        nodesRef.current.set(m.uid, root);
        scene.add(root);
      }
      root.position.set(x, 0, z);
      root.lookAt(0, 1.6, 0);

      // highlight ring for current user
      let ring = root.getObjectByName("highlight-ring") as THREE.Mesh | null;
      if (m.uid === currentUid) {
        if (!ring) {
          ring = new THREE.Mesh(
            new THREE.RingGeometry(0.45, 0.55, 32),
            new THREE.MeshBasicMaterial({ color: 0x35f06b })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.01;
          ring.name = "highlight-ring";
          root.add(ring);
        }
      } else if (ring) {
        ring.parent?.remove(ring);
      }

      // character node
      let charNode = root.getObjectByName("char-root") as THREE.Object3D | null;
      if (charNode && charNode.userData.character_id !== m.character_id) {
        const mix = mixersRef.current.get(m.uid);
        mix?.stopAllAction();
        mixersRef.current.delete(m.uid);
        root.remove(charNode);
        charNode = null;
      }
      if (!charNode) {
        charNode = new THREE.Group();
        charNode.name = "char-root";
        charNode.userData.character_id = m.character_id;
        root.add(charNode);

        if (m.character_id) {
          try {
            const base = await loader.loadAsync(basePathFor(m.character_id));
            base.scale.setScalar(0.01);
            charNode.add(base);

            try {
              const idle = await loader.loadAsync(sitIdlePathFor(m.character_id));
              const mixer = new THREE.AnimationMixer(base);
              const clip = idle.animations[0];
              if (clip) {
                const action = mixer.clipAction(clip);
                action.reset().fadeIn(0.25).play();
                mixersRef.current.set(m.uid, mixer);
              }
            } catch {
              // no idle anim — ignore
            }
          } catch {
            // model failed — fallback placeholder
            const ph = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.22, 1.2, 4, 8),
              new THREE.MeshStandardMaterial({ color: 0x444444 })
            );
            ph.position.y = 0.8;
            charNode.add(ph);
          }
        } else {
          // no character chosen yet
          const ph = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.22, 1.2, 4, 8),
            new THREE.MeshStandardMaterial({ color: 0x2a2a2a })
          );
          ph.position.y = 0.8;
          charNode.add(ph);
        }
      }

      // label DOM
      let label = labelsRef.current.get(m.uid);
      if (!label) {
        label = document.createElement("div");
        label.className =
          "absolute pointer-events-none text-xs px-2 py-1 rounded bg-black/60 text-white border border-white/10";
        overlay.appendChild(label);
        labelsRef.current.set(m.uid, label);
      }
      label.textContent = `${m.display_name}${m.is_ready ? " ✅" : ""}`;
    };

    // order by seats
    const sorted = [...members].sort((a, b) => a.seat_index - b.seat_index);
    sorted.forEach((m, i) => {
      void ensureMember(m, i, sorted.length);
    });

    // remove visuals for members gone
    const liveUids = new Set(sorted.map((m) => m.uid));
    nodesRef.current.forEach((node, uid) => {
      if (!liveUids.has(uid)) {
        scene.remove(node);
        nodesRef.current.delete(uid);
      }
    });
    labelsRef.current.forEach((el, uid) => {
      if (!liveUids.has(uid)) {
        el.remove();
        labelsRef.current.delete(uid);
      }
    });
  }, [members, currentUid]);

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl border border-neutral-800 overflow-hidden"
    >
      <canvas ref={canvasRef} className="block w-full h-[360px]" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0" />
      <div className="absolute left-2 top-2 text-xs text-neutral-400">
        Tip: click a teammate to request a swap.
      </div>
    </div>
  );
}
