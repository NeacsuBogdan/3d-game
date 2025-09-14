'use client';

import { FBXLoader } from 'three-stdlib';
import {
  AnimationMixer,
  LoopRepeat,
  LoopOnce,
  type AnimationClip,
  type Scene,
  type Object3D,
  type Group,
  type AnimationAction,
} from 'three';

export type BaseMode = 'idle' | 'sit_idle';

export type LoadedCharacter = {
  model: Object3D;
  mixer: AnimationMixer;
  clips: Record<string, AnimationClip>;
  /** Crossfade to a looping clip (also updates base mode if idle/sit_idle). */
  fadeToLoop: (name: string, fadeSeconds?: number) => void;
  /** Crossfade to a one-shot clip, then return to current (or override) base. */
  fadeToOnce: (name: string, fadeSeconds?: number, overrideBase?: BaseMode) => void;
  /** Set and fade to base loop explicitly. */
  setBaseMode: (mode: BaseMode, fadeSeconds?: number) => void;
  /** Play sit down and switch base to sit_idle. */
  sitDown: (fadeSeconds?: number) => void;
  /** Play stand up and switch base to idle. */
  standUp: (fadeSeconds?: number) => void;
};

type FBXGroup = Group & { animations?: AnimationClip[] };

export async function loadCharacter(scene: Scene, id: string): Promise<LoadedCharacter> {
  const basePath = `/models/${id}`;
  const loader = new FBXLoader();

  const base = (await loader.loadAsync(`${basePath}/base.fbx`)) as FBXGroup;
  // Asigură-te că avem animations pe root
  base.animations = (base.animations ?? []).map((c) => c.clone());

  const model: Object3D = base;
  scene.add(model);

  const mixer = new AnimationMixer(model);
  const clips: Record<string, AnimationClip> = {};

  // base idle (first clip from base file)
  const idleClip = base.animations?.[0];
  if (idleClip) {
    idleClip.name = 'idle';
    clips['idle'] = idleClip;
  }

  // extra clips
  const animPaths: Record<string, string> = {
    stand_up: `${basePath}/anims/sit_to_stand.fbx`,
    point: `${basePath}/anims/sitting_point.fbx`,
    fail: `${basePath}/anims/sitting_disbelief.fbx`,
    sit_idle: `${basePath}/anims/sit_idle.fbx`,
    win: `${basePath}/anims/sitting_victory.fbx`,
    sit: `${basePath}/anims/sitting.fbx`, // ← “sit down”
    wave: `${basePath}/anims/wave.fbx`,
  };

  await Promise.all(
    Object.entries(animPaths).map(async ([key, path]) => {
      const fbx = (await loader.loadAsync(path)) as FBXGroup;
      const clip = fbx.animations?.[0];
      if (clip) {
        const c = clip.clone();
        c.name = key;
        clips[key] = c;
      }
    })
  );

  // current state
  let current: AnimationAction | null = null;
  let baseMode: BaseMode = 'idle';

  const playBase = (mode: BaseMode, fadeSeconds = 0.25) => {
    const clip = clips[mode];
    if (!clip) return;
    const next = mixer.clipAction(clip);
    next.enabled = true;
    next.reset().setLoop(LoopRepeat, Infinity);
    if (current && current !== next) current.crossFadeTo(next, fadeSeconds, true);
    else next.fadeIn(fadeSeconds);
    next.setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    current = next;
    baseMode = mode;
  };

  const setBaseMode = (mode: BaseMode, fadeSeconds = 0.25) => {
    playBase(mode, fadeSeconds);
  };

  const fadeToLoop = (name: string, fadeSeconds = 0.25) => {
    const clip = clips[name];
    if (!clip) return;
    const next = mixer.clipAction(clip);
    next.enabled = true;
    next.reset().setLoop(LoopRepeat, Infinity);
    if (current && current !== next) current.crossFadeTo(next, fadeSeconds, true);
    else next.fadeIn(fadeSeconds);
    next.setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    current = next;
    if (name === 'idle' || name === 'sit_idle') baseMode = name;
  };

  const fadeToOnce = (name: string, fadeSeconds = 0.25, overrideBase?: BaseMode) => {
    const clip = clips[name];
    if (!clip) return;
    const next = mixer.clipAction(clip);
    next.enabled = true;
    next.reset().setLoop(LoopOnce, 1);
    next.clampWhenFinished = true;

    const targetBase: BaseMode = overrideBase ?? baseMode;

    const finishHandler = (e: { action: AnimationAction }) => {
      if (e.action !== next) return;
      mixer.removeEventListener('finished', finishHandler);
      playBase(targetBase, fadeSeconds);
    };

    if (current && current !== next) current.crossFadeTo(next, fadeSeconds, false);
    else next.fadeIn(fadeSeconds);

    next.setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    mixer.addEventListener('finished', finishHandler);
    current = next;
  };

  const sitDown = (fadeSeconds = 0.25) => {
    // Play one-shot “sit” și trecem pe sit_idle
    fadeToOnce('sit', fadeSeconds, 'sit_idle');
    baseMode = 'sit_idle';
  };

  const standUp = (fadeSeconds = 0.25) => {
    // Play one-shot “stand_up” și trecem pe idle
    fadeToOnce('stand_up', fadeSeconds, 'idle');
    baseMode = 'idle';
  };

  // start with idle dacă există
  if (clips['idle']) playBase('idle', 0.3);

  return { model, mixer, clips, fadeToLoop, fadeToOnce, setBaseMode, sitDown, standUp };
}
