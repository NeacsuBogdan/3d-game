﻿"use client";

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

// === TUNABLES (poți regla valorile după gust) ===
const CHARACTER_TARGET_HEIGHT = 3; // înainte: 1.72 → face personajele mai mari
const CAMERA_FOV = 42;                // înainte: 45  → puțin mai “zoom”
const CAMERA_BASE_Y = 1.9;
const CAMERA_BASE_Z = 5.8;            // înainte: 6.8 → camera mai aproape
const ORBIT_X_AMPL = 0.65;            // înainte: 0.85 (mișcare laterală mai mică)
const ORBIT_Z_AMPL = 0.30;            // înainte: 0.35 (mișcare pe adâncime mai mică)
const LINEUP_GAP = 1.7;               // înainte: 1.5  → mai mult spațiu între persoane când sunt mai mari

// --- helpers: căi, bbox, normalizare ---

function measureWorldBounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (!isFinite(box.min.y) || !isFinite(box.max.y) || box.min.equals(box.max)) {
    // fallback dacă FBX-ul are bbox zero
    box.set(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 1.7, 0.3));
  }
  return box;
}

function fitToHeightAndFloor(model: THREE.Object3D, targetHeight = 1.72) {
  let box = measureWorldBounds(model);
  const rawH = Math.max(0.001, box.max.y - box.min.y);
  const s = targetHeight / rawH;
  model.scale.setScalar(s);
  box = measureWorldBounds(model);
  const dy = -box.min.y; // adu minimul pe podea
  model.position.y += dy;

  const rx = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
  const rz = Math.max(Math.abs(box.min.z), Math.abs(box.max.z));
  return { height: targetHeight, radius: Math.max(rx, rz) };
}

// Heuristic post-proc pentru materiale FBX (texturi, alpha, double-sided la păr/haine)
function fixMaterials(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as unknown as THREE.Mesh;
    if (!mesh.isMesh) return;

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : (mesh.material ? [mesh.material] : []);

    materials.forEach((mat) => {
      const m = mat as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial;
      // Color space corect pe hărți de culoare/emisive
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;

      // Alpha maps / transparență: evită “dispariții” de păr/haine
      const name = (m.name || mesh.name || "").toLowerCase();
      const looksLikeHairOrCloth = /hair|lash|cloth|skirt|dress|fabric|veil/i.test(name);
      if (m.alphaMap || m.transparent || looksLikeHairOrCloth) {
        m.transparent = true;
        if (m.alphaTest === 0) m.alphaTest = 0.4; // tăiere hard a “griului”
        // pentru plane subțiri vrem ambele fețe
        if (looksLikeHairOrCloth) m.side = THREE.DoubleSide;
      } else {
        m.side = THREE.FrontSide;
      }

      // Asigură scrierea în depth (evită ciudățenii de sortare)
      if (typeof m.depthWrite === "boolean") m.depthWrite = true;

      // Dacă vine ca Phong, e ok; nu convertim agresiv la Standard.
    });
  });
}

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

  const tmpV = useRef(new THREE.Vector3());

  const onClickMemberRef = useRef(onClickMember);
  useEffect(() => {
    onClickMemberRef.current = onClickMember;
  }, [onClickMember]);

  // === INIT SCENĂ ===
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    const w = container.clientWidth || 1024;
    const h = container.clientHeight || 600;
    // const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, w / h, 0.1, 200);
    // camera.position.set(0, 1.9, 6.8);
    camera.position.set(0, CAMERA_BASE_Y, CAMERA_BASE_Z);
    camera.lookAt(0, 1.7, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(3.2, 6.2, 4.0);
    const rim = new THREE.DirectionalLight(0x88bbff, 0.5);
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

    // pointer pick (model + collider capsulă)
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
      // mic orbit “cinematic”
      const cam = cameraRef.current;
      if (cam) {
        const t = performance.now() * 0.00008;
        cam.position.x = Math.sin(t) * ORBIT_X_AMPL;
        cam.position.z = CAMERA_BASE_Z + Math.cos(t) * ORBIT_Z_AMPL;
        cam.lookAt(0, 1.7, 0);
      }

      const dt = clockRef.current.getDelta();
      mixersRef.current.forEach((m) => m.update(dt));

      // labels via anchor dedicat
      const rend = rendererRef.current;
      if (cam && rend && overlayRef.current) {
        labelsRef.current.forEach((label, uid) => {
          const root = nodesRef.current.get(uid);
          if (!root) return;
          const anchor = root.getObjectByName("label-anchor");
          if (!anchor) return;
          const v = tmpV.current.setFromMatrixPosition(anchor.matrixWorld);
          v.project(cam);
          const x = (v.x * 0.5 + 0.5) * rend.domElement.clientWidth;
          const y = (-v.y * 0.5 + 0.5) * rend.domElement.clientHeight;
          label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
          label.style.opacity = v.z < 1 ? "1" : "0";
        });
      }

      renderNow();
      raf = requestAnimationFrame(animate);
    };
    animate();
    renderNow();

    // ---- capture pentru cleanup (REZOLVĂ eslint react-hooks/exhaustive-deps) ----
    const mixers = mixersRef.current;
    const nodes = nodesRef.current;
    const labels = labelsRef.current;
    // ---------------------------------------------------------------------------

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointer);

      // folosim capturile locale, nu .current (evită warningurile)
      mixers.forEach((m) => m.stopAllAction());
      mixers.clear();

      nodes.forEach((n) => scene.remove(n));
      nodes.clear();

      labels.forEach((el) => el.remove());
      labels.clear();

      renderer.dispose();
      (scene as unknown as { dispose?: () => void }).dispose?.();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // loader + cache (cu resourcePath per model, important pentru texturi relative)
  const getModelProto = async (
    charId: string
  ): Promise<{ proto: THREE.Object3D; clips: THREE.AnimationClip[] }> => {
    const cache = modelCacheRef.current;
    const cached = cache.get(charId);
    if (cached) return cached;

    const dir = `/models/${cap(charId)}/`;
    const loader = new FBXLoader();
    loader.setPath(dir);                // caută relative față de folder
    loader.setResourcePath(dir);        // texturi relative din FBX
    const promise = loader.loadAsync(`base.fbx`).then((base) => {
      const clips = (base as unknown as { animations?: THREE.AnimationClip[] }).animations ?? [];
      return { proto: base, clips };
    });
    cache.set(charId, promise);
    return promise;
  };

  // reconcile pe changes
  useEffect(() => {
    const scene = sceneRef.current;
    const overlay = overlayRef.current;
    if (!scene || !overlay) return;

    // ordonare: eu centru, restul alternant
    const order = [...members].sort((a, b) => a.seat_index - b.seat_index);
    const meIndex = order.findIndex((m) => m.uid === currentUid);
    const meFirst = meIndex >= 0 ? [order[meIndex], ...order.filter((_, i) => i !== meIndex)] : order;

    const positions: Array<{ uid: string; x: number; z: number; scale: number }> = [];
    const gap = LINEUP_GAP;
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
        disk.name = "select-disk";
        root.add(disk);

        const labelAnchor = new THREE.Object3D();
        labelAnchor.name = "label-anchor";
        labelAnchor.position.set(0, 1.8, 0);
        root.add(labelAnchor);

        const collider = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.35, 1.0, 8, 16),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false })
        );
        collider.name = "hit-collider";
        collider.position.y = 0.9;
        root.add(collider);

        scene.add(root);
        nodesRef.current.set(uid, root);
      }

      root.position.set(pos.x, root.position.y, pos.z);
      root.scale.setScalar(pos.scale);
      root.lookAt(0, 1.7, 10);

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

      const prevCharId = charIdByUidRef.current.get(uid) ?? null;
      const nextCharId = m.character_id ?? null;
      if (prevCharId === nextCharId) return;

      const oldMixer = mixersRef.current.get(uid);
      if (oldMixer) {
        oldMixer.stopAllAction();
        mixersRef.current.delete(uid);
      }

      const token = (loadTokenRef.current.get(uid) ?? 0) + 1;
      loadTokenRef.current.set(uid, token);

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

        const anchor = root.getObjectByName("label-anchor");
        if (anchor) (anchor as THREE.Object3D).position.y = 1.8;
        const coll = root.getObjectByName("hit-collider") as THREE.Mesh | null;
        if (coll) {
          coll.geometry.dispose();
          coll.geometry = new THREE.CapsuleGeometry(0.35, 1.0, 8, 16);
          coll.position.y = 0.9;
        }

        charIdByUidRef.current.set(uid, null);
        return;
      }

      try {
        const { proto, clips } = await getModelProto(nextCharId);
        if (loadTokenRef.current.get(uid) !== token) return;

        const newRoot = new THREE.Group();
        newRoot.name = "char-root";
        const clone = SkeletonUtils.clone(proto) as THREE.Object3D;

        // **material fix** înainte de orice
        fixMaterials(clone);

        newRoot.add(clone);

        // normalizează înălțimea și așează pe podea
        const { height, radius } = fitToHeightAndFloor(clone, CHARACTER_TARGET_HEIGHT);

        // actualizează label anchor exact deasupra capului
        const anchor = root.getObjectByName("label-anchor");
        if (anchor) (anchor as THREE.Object3D).position.y = height + 0.12;

        // collider invizibil adaptat modelului
        const coll = root.getObjectByName("hit-collider") as THREE.Mesh | null;
        if (coll) {
          coll.geometry.dispose();
          coll.geometry = new THREE.CapsuleGeometry(Math.max(0.3, radius * 0.7), Math.max(0.8, height * 0.6), 8, 16);
          coll.position.y = Math.max(0.7, height * 0.5);
        }

        // animație idle dacă există
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
      }
    };

    const uids = members.map((m) => m.uid);
    uids.forEach((uid) => void ensureMember(uid));

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
