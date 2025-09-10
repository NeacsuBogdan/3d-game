"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader, SkeletonUtils } from "three-stdlib";
import type { StageMember } from "../_shared/types";

type Props = {
  members: StageMember[];
  currentUid: string | null;
  onClickMember: (uid: string) => void;
};

const cap = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1).toLowerCase();
const basePathFor = (charId: string) => `/models/${cap(charId)}/base.fbx`;

export default function ShowroomStage3D({ members, currentUid, onClickMember }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const clockRef = useRef(new THREE.Clock());

  // state intern
  const nodesRef = useRef(new Map<string, THREE.Object3D>());            // uid -> root
  const labelsRef = useRef(new Map<string, HTMLDivElement>());           // uid -> label
  const charIdByUidRef = useRef(new Map<string, string | null>());       // uid -> charId redat
  const loadTokenRef = useRef(new Map<string, number>());                // uid -> versiune pentru async load
  const mixersRef = useRef(new Map<string, THREE.AnimationMixer>());     // uid -> mixer

  // cache modele + clipuri (o singură încărcare per charId)
  const modelCacheRef = useRef(
    new Map<string, Promise<{ proto: THREE.Object3D; clips: THREE.AnimationClip[] }>>()
  );

  // temp objects pt calcule (evităm GC)
  const tmpBox = useRef(new THREE.Box3());
  const tmpV = useRef(new THREE.Vector3());

  // păstrăm handlerul de click fără să reinițializăm scena
  const onClickMemberRef = useRef(onClickMember);
  useEffect(() => {
    onClickMemberRef.current = onClickMember;
  }, [onClickMember]);

  // === INIT SCENĂ (o singură dată) ===
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    const w = container.clientWidth || 1024;
    const h = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    camera.position.set(0, 1.9, 6.8);
    camera.lookAt(0, 1.7, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);

    // lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(2.8, 6.2, 3.8);
    const rim = new THREE.DirectionalLight(0x88bbff, 0.45);
    rim.position.set(-3.2, 4.5, -2.2);
    scene.add(ambient, key, rim);

    // floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 28),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.35, roughness: 0.55 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // copii locale pt cleanup (evităm deps pe .current în cleanup)
    const nodesForCleanup = nodesRef.current;
    const labelsForCleanup = labelsRef.current;
    const mixersForCleanup = mixersRef.current;

    const renderNow = () => {
      if (sceneRef.current && cameraRef.current && rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    const onResize = () => {
      const c = containerRef.current, r = rendererRef.current, cam = cameraRef.current;
      if (!c || !r || !cam) return;
      const width = c.clientWidth, height = c.clientHeight;
      r.setSize(width, height, false);
      cam.aspect = width / height;
      cam.updateProjectionMatrix();
      renderNow();
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(container);
    window.addEventListener("resize", onResize);

    // pointer pick
    const onPointer = (e: PointerEvent) => {
      const r = rendererRef.current, cam = cameraRef.current;
      if (!r || !cam) return;
      const rect = r.domElement.getBoundingClientRect();
      pointerRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(pointerRef.current, cam);
      const roots = Array.from(nodesRef.current.values());
      const hit = raycasterRef.current.intersectObjects(roots, true)[0];
      if (hit) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj && !obj.userData?.uid) obj = obj.parent;
        if (obj?.userData?.uid) onClickMemberRef.current(String(obj.userData.uid));
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointer);

    let raf = 0;
    const animate = () => {
      const cam = cameraRef.current;
      if (cam) {
        const t = performance.now() * 0.00008;
        cam.position.x = Math.sin(t) * 0.85;
        cam.position.z = 6.8 + Math.cos(t) * 0.35;
        cam.lookAt(0, 1.7, 0);
      }

      // animații
      const dt = clockRef.current.getDelta();
      mixersRef.current.forEach((m) => m.update(dt));

      // labels deasupra capului (folosind bounding box world)
      const rend = rendererRef.current;
      if (cam && rend && overlayRef.current) {
        labelsRef.current.forEach((label, uid) => {
          const root = nodesRef.current.get(uid);
          if (!root) return;
          const charNode = root.getObjectByName("char-root");
          if (!charNode) return;

          const box = tmpBox.current;
          box.setFromObject(charNode);
          // top-center world point
          const xw = (box.min.x + box.max.x) * 0.5;
          const yw = box.max.y;
          const zw = (box.min.z + box.max.z) * 0.5;

          const v = tmpV.current.set(xw, yw, zw);
          v.project(cam);

          const x = (v.x * 0.5 + 0.5) * rend.domElement.clientWidth;
          const y = (-v.y * 0.5 + 0.5) * rend.domElement.clientHeight - 8; // mic spațiu deasupra capului
          label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
          label.style.opacity = v.z < 1 ? "1" : "0";
        });
      }

      renderNow();
      raf = requestAnimationFrame(animate);
    };
    animate();
    renderNow();

    // cleanup
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointer);

      mixersForCleanup.forEach((m) => m.stopAllAction());
      mixersForCleanup.clear();

      nodesForCleanup.forEach((n) => scene.remove(n));
      nodesForCleanup.clear();
      labelsForCleanup.forEach((el) => el.remove());
      labelsForCleanup.clear();

      renderer.dispose();
      (scene as unknown as { dispose?: () => void }).dispose?.();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // încarcă o singură dată modelul + clipurile din base.fbx și îl servește ca prototip
  const getModelProto = async (
    charId: string
  ): Promise<{ proto: THREE.Object3D; clips: THREE.AnimationClip[] }> => {
    const cache = modelCacheRef.current;
    const cached = cache.get(charId);
    if (cached) return cached;

    const loader = new FBXLoader();
    const promise = loader.loadAsync(basePathFor(charId)).then((base) => {
      // dacă base.fbx conține animații, le folosim (clipul 0 ca idle)
      const clips = (base as unknown as { animations?: THREE.AnimationClip[] }).animations ?? [];
      base.scale.setScalar(0.013); // puțin mai mare
      base.position.y = 0.0;
      return { proto: base, clips };
    });
    cache.set(charId, promise);
    return promise;
  };

  // reconcile pe schimbări de members/currentUid (NU reinițializează scena)
  useEffect(() => {
    const scene = sceneRef.current;
    const overlay = overlayRef.current;
    if (!scene || !overlay) return;

    // ordine: eu în centru, ceilalți alternant dreapta/stânga
    const order = [...members].sort((a, b) => a.seat_index - b.seat_index);
    const meIndex = order.findIndex((m) => m.uid === currentUid);
    const meFirst = meIndex >= 0 ? [order[meIndex], ...order.filter((_, i) => i !== meIndex)] : order;

    const positions: Array<{ uid: string; x: number; z: number; scale: number }> = [];
    const gap = 1.5;
    meFirst.forEach((m, i) => {
      if (i === 0) positions.push({ uid: m.uid, x: 0, z: 0, scale: 1.08 });
      else {
        const k = Math.ceil(i / 2);
        const dir = i % 2 === 1 ? 1 : -1;
        positions.push({ uid: m.uid, x: dir * k * gap, z: Math.min(0.24 * k, 0.9), scale: 1.0 });
      }
    });

    const ensureMember = async (uid: string) => {
      const m = members.find((x) => x.uid === uid);
      if (!m) return;

      const pos = positions.find((p) => p.uid === uid);
      if (!pos) return;

      let root = nodesRef.current.get(uid);
      if (!root) {
        root = new THREE.Group();
        root.userData.uid = uid;

        const disk = new THREE.Mesh(
          new THREE.CircleGeometry(uid === currentUid ? 0.7 : 0.56, 32),
          new THREE.MeshBasicMaterial({
            color: uid === currentUid ? 0x35f06b : 0x3a3a3a,
            transparent: true,
            opacity: uid === currentUid ? 0.6 : 0.4,
          })
        );
        disk.rotation.x = -Math.PI / 2;
        disk.position.y = 0.01;
        root.add(disk);

        scene.add(root);
        nodesRef.current.set(uid, root);
      }

      // transform
      root.position.set(pos.x, root.position.y, pos.z);
      root.scale.setScalar(pos.scale);
      root.lookAt(0, 1.7, 10);

      // label (update doar dacă s-a schimbat textul)
      const labelText = `${m.display_name}${m.is_ready ? " ✅" : ""}`;
      let label = labelsRef.current.get(uid);
      if (!label) {
        label = document.createElement("div");
        label.className =
          "absolute pointer-events-none text-xs px-2 py-1 rounded bg-black/60 text-white border border-white/10";
        overlay.appendChild(label);
        labelsRef.current.set(uid, label);
        label.textContent = labelText;
      } else if (label.textContent !== labelText) {
        label.textContent = labelText;
      }

      // character
      const prevCharId = charIdByUidRef.current.get(uid) ?? null;
      const nextCharId = m.character_id ?? null;

      // dacă nu s-a schimbat charId, nu atinge modelul (ready/unready nu atinge char-root)
      if (prevCharId === nextCharId) return;

      // oprește mixerul anterior (dacă era)
      const oldMixer = mixersRef.current.get(uid);
      if (oldMixer) {
        oldMixer.stopAllAction();
        mixersRef.current.delete(uid);
      }

      // versiune nouă pentru încărcare (ca să anulăm rezultatele stale)
      const token = (loadTokenRef.current.get(uid) ?? 0) + 1;
      loadTokenRef.current.set(uid, token);

      // dacă devine null → pune placeholder imediat
      if (!nextCharId) {
        const prevNode = root.getObjectByName("char-root");
        if (prevNode) root.remove(prevNode);

        const phRoot = new THREE.Group();
        phRoot.name = "char-root";
        const ph = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.25, 1.25, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0x2a2a2a })
        );
        ph.position.y = 0.85;
        phRoot.add(ph);
        root.add(phRoot);

        charIdByUidRef.current.set(uid, null);
        return;
      }

      // altfel: păstrăm vechiul model până e pregătit cel nou
      try {
        const { proto, clips } = await getModelProto(nextCharId);
        if (loadTokenRef.current.get(uid) !== token) return; // s-a schimbat între timp

        const newRoot = new THREE.Group();
        newRoot.name = "char-root";
        const clone = SkeletonUtils.clone(proto) as THREE.Object3D;
        newRoot.add(clone);

        // dacă există clipuri în base.fbx, redăm primul ca idle
        if (clips.length > 0) {
          const mixer = new THREE.AnimationMixer(clone);
          const action = mixer.clipAction(clips[0]);
          action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
          mixersRef.current.set(uid, mixer);
        }

        const old = root.getObjectByName("char-root");
        if (old) root.remove(old);
        root.add(newRoot);

        charIdByUidRef.current.set(uid, nextCharId);
      } catch {
        // nu reușim să încărcăm: păstrăm ce e pe ecran; dacă nu e nimic, punem placeholder
        const hasExisting = !!root.getObjectByName("char-root");
        if (!hasExisting) {
          const phRoot = new THREE.Group();
          phRoot.name = "char-root";
          const ph = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.25, 1.25, 4, 8),
            new THREE.MeshStandardMaterial({ color: 0x555555 })
          );
          ph.position.y = 0.85;
          phRoot.add(ph);
          root.add(phRoot);
        }
        // nu actualizăm charIdByUidRef (schimbarea nu a reușit)
      }
    };

    // aplicăm la toți membrii
    const uids = members.map((m) => m.uid);
    uids.forEach((uid) => {
      void ensureMember(uid);
    });

    // cleanup pentru membrii ieșiți
    nodesRef.current.forEach((node, uid) => {
      if (!uids.includes(uid)) {
        const mix = mixersRef.current.get(uid);
        if (mix) {
          mix.stopAllAction();
          mixersRef.current.delete(uid);
        }
        scene.remove(node);
        nodesRef.current.delete(uid);
        charIdByUidRef.current.delete(uid);
        loadTokenRef.current.delete(uid);
      }
    });
    labelsRef.current.forEach((el, uid) => {
      if (!uids.includes(uid)) {
        el.remove();
        labelsRef.current.delete(uid);
      }
    });
  }, [members, currentUid]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[600px] rounded-xl border border-neutral-800 overflow-hidden"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0" />
      <div className="absolute left-2 top-2 text-xs text-neutral-400">
        Tip: click a teammate to request a swap.
      </div>
    </div>
  );
}
