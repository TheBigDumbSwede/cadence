import * as THREE from "three";
import {
  VRMExpressionPresetName,
  VRMHumanBoneName,
  type VRM
} from "@pixiv/three-vrm";
import type { AssistantStateSnapshot } from "../../shared/assistant-state";
import type {
  AvatarPerformanceSnapshot,
  PerformanceGesture,
} from "../../shared/performance-directive";
import {
  avatarMotionRegistry,
  type BoneRotation,
  type MotionSlot,
  type PoseDefinition
} from "./motionRegistry";
import { avatarClipLibrary } from "./clipLibrary";

export type RigBone = {
  node: THREE.Object3D;
  restQuaternion: THREE.Quaternion;
  targetQuaternion: THREE.Quaternion;
};

export const POSE_BONES: VRMHumanBoneName[] = [
  VRMHumanBoneName.Hips,
  VRMHumanBoneName.Spine,
  VRMHumanBoneName.Chest,
  VRMHumanBoneName.UpperChest,
  VRMHumanBoneName.Neck,
  VRMHumanBoneName.Head,
  VRMHumanBoneName.LeftShoulder,
  VRMHumanBoneName.RightShoulder,
  VRMHumanBoneName.LeftUpperArm,
  VRMHumanBoneName.RightUpperArm,
  VRMHumanBoneName.LeftLowerArm,
  VRMHumanBoneName.RightLowerArm,
  VRMHumanBoneName.LeftHand,
  VRMHumanBoneName.RightHand
];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sumBoneRotations(...rotations: Array<BoneRotation | undefined>): BoneRotation {
  let x = 0;
  let y = 0;
  let z = 0;

  for (const rotation of rotations) {
    if (!rotation) {
      continue;
    }

    x += rotation[0];
    y += rotation[1];
    z += rotation[2];
  }

  return [x, y, z];
}

function sampleTrack(
  track: readonly { time: number; rotation: BoneRotation }[],
  time: number,
  duration: number,
  loop: boolean
): BoneRotation | undefined {
  if (track.length === 0) {
    return undefined;
  }

  if (track.length === 1) {
    return track[0]?.rotation;
  }

  const clipTime = loop && duration > 0 ? ((time % duration) + duration) % duration : time;
  let previous = track[0];
  let next = track[track.length - 1];

  for (let index = 1; index < track.length; index += 1) {
    const candidate = track[index];
    if (!candidate) {
      continue;
    }

    if (clipTime <= candidate.time) {
      next = candidate;
      break;
    }

    previous = candidate;
  }

  const span = Math.max(next.time - previous.time, 0.0001);
  const alpha = clamp01((clipTime - previous.time) / span);
  return [
    THREE.MathUtils.lerp(previous.rotation[0], next.rotation[0], alpha),
    THREE.MathUtils.lerp(previous.rotation[1], next.rotation[1], alpha),
    THREE.MathUtils.lerp(previous.rotation[2], next.rotation[2], alpha)
  ];
}

function resolveSlotPose(slot: MotionSlot, time: number): PoseDefinition {
  if (slot.kind === "procedural") {
    return slot.pose;
  }

  const clipSource = slot.clipId ? avatarClipLibrary[slot.clipId] : slot.pose;
  if (!clipSource) {
    return {};
  }

  const resolved: PoseDefinition = {};
  for (const [boneName, track] of Object.entries(clipSource) as Array<
    [VRMHumanBoneName, readonly { time: number; rotation: BoneRotation }[]]
  >) {
    const sampled = sampleTrack(track, time, slot.duration, slot.loop ?? true);
    if (sampled) {
      resolved[boneName] = sampled;
    }
  }

  return resolved;
}

function getPaceMultiplier(pace: AvatarPerformanceSnapshot["pace"]): number {
  switch (pace) {
    case "animated":
      return 1.28;
    case "calm":
      return 0.86;
    case "steady":
    default:
      return 1;
  }
}

function getGestureOffset(
  boneName: VRMHumanBoneName,
  gesture: PerformanceGesture,
  progress: number,
  intensity: number
): BoneRotation | undefined {
  if (progress <= 0 || gesture === "none") {
    return undefined;
  }

  const weight = progress * (0.5 + intensity * 0.6);

  switch (gesture) {
    case "nod":
      if (boneName === VRMHumanBoneName.Chest) {
        return [0.04 * weight, 0, 0];
      }
      if (boneName === VRMHumanBoneName.Neck) {
        return [0.1 * weight, 0, 0];
      }
      if (boneName === VRMHumanBoneName.Head) {
        return [0.15 * weight, 0, 0];
      }
      return undefined;
    case "open_hand":
      if (boneName === VRMHumanBoneName.Chest) {
        return [0.03 * weight, 0.02 * weight, 0];
      }
      if (boneName === VRMHumanBoneName.LeftShoulder) {
        return [0.03 * weight, 0, 0.12 * weight];
      }
      if (boneName === VRMHumanBoneName.RightShoulder) {
        return [0.02 * weight, 0, -0.08 * weight];
      }
      if (boneName === VRMHumanBoneName.LeftUpperArm) {
        return [0.08 * weight, 0.04 * weight, 0.08 * weight];
      }
      if (boneName === VRMHumanBoneName.RightUpperArm) {
        return [0.05 * weight, -0.03 * weight, -0.05 * weight];
      }
      if (boneName === VRMHumanBoneName.LeftLowerArm) {
        return [0.2 * weight, 0.06 * weight, -0.38 * weight];
      }
      if (boneName === VRMHumanBoneName.RightLowerArm) {
        return [0.16 * weight, -0.04 * weight, 0.3 * weight];
      }
      if (boneName === VRMHumanBoneName.LeftHand) {
        return [0.28 * weight, 0.1 * weight, 0.06 * weight];
      }
      if (boneName === VRMHumanBoneName.RightHand) {
        return [0.18 * weight, -0.06 * weight, -0.02 * weight];
      }
      return undefined;
    case "small_shrug":
      if (boneName === VRMHumanBoneName.LeftShoulder) {
        return [-0.08 * weight, 0, 0.08 * weight];
      }
      if (boneName === VRMHumanBoneName.RightShoulder) {
        return [-0.08 * weight, 0, -0.08 * weight];
      }
      if (boneName === VRMHumanBoneName.Neck || boneName === VRMHumanBoneName.Head) {
        return [-0.02 * weight, 0, 0];
      }
      return undefined;
    case "thinking_touch":
      if (boneName === VRMHumanBoneName.Chest) {
        return [-0.02 * weight, -0.02 * weight, 0];
      }
      if (boneName === VRMHumanBoneName.RightUpperArm) {
        return [0.14 * weight, -0.08 * weight, -0.08 * weight];
      }
      if (boneName === VRMHumanBoneName.RightLowerArm) {
        return [0.26 * weight, -0.08 * weight, 0.62 * weight];
      }
      if (boneName === VRMHumanBoneName.RightHand) {
        return [0.4 * weight, -0.1 * weight, 0.04 * weight];
      }
      if (boneName === VRMHumanBoneName.Head) {
        return [0.05 * weight, -0.07 * weight, 0];
      }
      return undefined;
    default:
      return undefined;
  }
}

function getDynamicOffset(
  boneName: VRMHumanBoneName,
  state: AssistantStateSnapshot["type"],
  performance: AvatarPerformanceSnapshot,
  time: number
): BoneRotation | undefined {
  const pace = getPaceMultiplier(performance.pace);
  const intensity = 0.65 + performance.intensity * 0.9;

  if (boneName === VRMHumanBoneName.Spine || boneName === VRMHumanBoneName.Chest) {
    return [
      Math.sin(time * 1.2 * pace) * 0.018 * intensity,
      Math.sin(time * 0.7 * pace) * 0.006 * intensity,
      0
    ];
  }

  if (boneName === VRMHumanBoneName.UpperChest) {
    return [Math.sin(time * 1.45 * pace) * 0.014 * intensity, 0, 0];
  }

  if (boneName === VRMHumanBoneName.Neck || boneName === VRMHumanBoneName.Head) {
    if (state === "listening") {
      return [0, Math.sin(time * 1.6 * pace) * 0.035 * intensity, 0];
    }

    if (state === "thinking" || state === "transcribing") {
      return [
        Math.sin(time * 1.1 * pace) * 0.018 * intensity,
        Math.sin(time * 0.8 * pace) * 0.03 * intensity,
        0
      ];
    }

    if (state === "speaking") {
      return [
        Math.sin(time * 4.2 * pace) * 0.018 * intensity,
        Math.sin(time * 1.9 * pace) * 0.028 * intensity,
        0
      ];
    }
  }

  if (state === "speaking") {
    if (boneName === VRMHumanBoneName.LeftShoulder) {
      return [
        Math.sin(time * 2.4 * pace) * 0.02 * intensity,
        Math.sin(time * 1.5 * pace) * 0.012 * intensity,
        Math.sin(time * 2.6 * pace) * 0.03 * intensity
      ];
    }

    if (boneName === VRMHumanBoneName.RightShoulder) {
      return [
        Math.sin(time * 1.8 * pace + 0.5) * 0.012 * intensity,
        -Math.sin(time * 1.2 * pace + 0.3) * 0.008 * intensity,
        -Math.sin(time * 2.2 * pace + 0.6) * 0.02 * intensity
      ];
    }

    if (boneName === VRMHumanBoneName.LeftUpperArm) {
      return [
        Math.sin(time * 2.1 * pace) * 0.03 * intensity,
        Math.sin(time * 1.6 * pace) * 0.02 * intensity,
        Math.sin(time * 2.3 * pace) * 0.025 * intensity
      ];
    }

    if (boneName === VRMHumanBoneName.RightUpperArm) {
      return [
        Math.sin(time * 1.7 * pace + 0.7) * 0.02 * intensity,
        -Math.sin(time * 1.3 * pace + 0.4) * 0.012 * intensity,
        -Math.sin(time * 2.1 * pace + 0.3) * 0.018 * intensity
      ];
    }

    if (boneName === VRMHumanBoneName.LeftLowerArm) {
      return [
        0.08 * intensity + Math.sin(time * 2.6 * pace) * 0.08 * intensity,
        Math.sin(time * 1.8 * pace) * 0.04 * intensity,
        -0.18 * intensity - Math.sin(time * 3.4 * pace) * 0.24 * intensity
      ];
    }

    if (boneName === VRMHumanBoneName.RightLowerArm) {
      return [
        0.04 * intensity + Math.sin(time * 2.2 * pace + 0.8) * 0.06 * intensity,
        -Math.sin(time * 1.4 * pace + 0.5) * 0.03 * intensity,
        0.14 * intensity + Math.sin(time * 2.9 * pace + 0.5) * 0.18 * intensity
      ];
    }

    if (boneName === VRMHumanBoneName.LeftHand) {
      return [
        0.16 * intensity + Math.sin(time * 2.8 * pace) * 0.16 * intensity,
        Math.sin(time * 2.1 * pace) * 0.1 * intensity,
        Math.sin(time * 2.4 * pace) * 0.04 * intensity
      ];
    }

    if (boneName === VRMHumanBoneName.RightHand) {
      return [
        0.1 * intensity + Math.sin(time * 2.3 * pace + 0.6) * 0.1 * intensity,
        -Math.sin(time * 1.5 * pace + 0.2) * 0.06 * intensity,
        -Math.sin(time * 2.0 * pace + 0.7) * 0.025 * intensity
      ];
    }
  }

  return undefined;
}

export function createRigBones(vrm: VRM): Map<VRMHumanBoneName, RigBone> {
  const rigBones = new Map<VRMHumanBoneName, RigBone>();

  for (const boneName of POSE_BONES) {
    const boneNode = vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!boneNode) {
      continue;
    }

    rigBones.set(boneName, {
      node: boneNode,
      restQuaternion: boneNode.quaternion.clone(),
      targetQuaternion: new THREE.Quaternion()
    });
  }

  return rigBones;
}

export function applyAvatarPose(
  rigBones: Map<VRMHumanBoneName, RigBone>,
  state: AssistantStateSnapshot["type"],
  performance: AvatarPerformanceSnapshot,
  gestureProgress: number,
  time: number,
  delta: number
): void {
  const baseMotion = avatarMotionRegistry.base;
  const idleRestMotion = avatarMotionRegistry.idleRestPose;
  const stateMotion = avatarMotionRegistry.states[state];
  const moodMotion = avatarMotionRegistry.moods[performance.mood];
  const baseSlot = resolveSlotPose(baseMotion, time);
  const idleRestSlot =
    state === "idle" || state === "speaking"
      ? resolveSlotPose(idleRestMotion, time)
      : {};
  const stateSlot = resolveSlotPose(stateMotion, time);
  const moodSlot = resolveSlotPose(moodMotion, time);
  const blend = 1 - Math.exp(-delta * 8.5);
  const euler = new THREE.Euler();
  const offsetQuaternion = new THREE.Quaternion();

  rigBones.forEach((rigBone, boneName) => {
    const stateRotation = stateSlot[boneName];
    const rotation = sumBoneRotations(
      stateMotion.blend === "override" && stateRotation ? undefined : baseSlot[boneName],
      idleRestSlot[boneName],
      stateRotation,
      moodSlot[boneName],
      getDynamicOffset(boneName, state, performance, time),
      getGestureOffset(boneName, performance.gesture, gestureProgress, performance.intensity)
    );

    euler.set(rotation[0], rotation[1], rotation[2], "XYZ");
    offsetQuaternion.setFromEuler(euler);
    rigBone.targetQuaternion.copy(rigBone.restQuaternion).multiply(offsetQuaternion);
    rigBone.node.quaternion.slerp(rigBone.targetQuaternion, blend);
  });
}

export function applyAvatarEmotion(
  vrm: VRM,
  state: AssistantStateSnapshot["type"],
  performance: AvatarPerformanceSnapshot,
  time: number
): void {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) {
    return;
  }

  expressionManager.setValue(VRMExpressionPresetName.Blink, 0);
  expressionManager.setValue(VRMExpressionPresetName.Happy, 0);
  expressionManager.setValue(VRMExpressionPresetName.Relaxed, 0);
  expressionManager.setValue(VRMExpressionPresetName.Angry, 0);
  expressionManager.setValue(VRMExpressionPresetName.Surprised, 0);
  expressionManager.setValue(VRMExpressionPresetName.Aa, 0);

  const blinkPhase = time % 4.6;
  const blinkWeight =
    blinkPhase > 0.06 && blinkPhase < 0.18
      ? 1 - Math.abs(blinkPhase - 0.12) / 0.06
      : 0;
  expressionManager.setValue(VRMExpressionPresetName.Blink, Math.max(0, blinkWeight));

  if (performance.mood === "warm") {
    expressionManager.setValue(VRMExpressionPresetName.Relaxed, 0.2 + performance.intensity * 0.14);
    expressionManager.setValue(VRMExpressionPresetName.Happy, 0.14 + performance.intensity * 0.24);
  } else if (performance.mood === "playful") {
    expressionManager.setValue(VRMExpressionPresetName.Happy, 0.22 + performance.intensity * 0.28);
    expressionManager.setValue(VRMExpressionPresetName.Surprised, 0.08);
  } else if (performance.mood === "concerned") {
    expressionManager.setValue(VRMExpressionPresetName.Angry, 0.06);
    expressionManager.setValue(VRMExpressionPresetName.Relaxed, 0.08);
  } else if (performance.mood === "focused") {
    expressionManager.setValue(VRMExpressionPresetName.Surprised, 0.06);
  } else {
    expressionManager.setValue(VRMExpressionPresetName.Relaxed, 0.14);
  }

  if (state === "speaking") {
    const mouthMotion = 0.16 + Math.max(0, Math.sin(time * 12 * getPaceMultiplier(performance.pace))) * (0.22 + performance.intensity * 0.16);
    expressionManager.setValue(
      VRMExpressionPresetName.Aa,
      clamp01(mouthMotion)
    );
  } else if (state === "thinking" || state === "transcribing") {
    expressionManager.setValue(VRMExpressionPresetName.Surprised, 0.1);
  } else if (state === "error") {
    expressionManager.setValue(VRMExpressionPresetName.Angry, 0.18);
  }
}
