import { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { AssistantStateSnapshot } from "../../shared/assistant-state";
import type {
  PerformanceGesture,
  PerformanceMood
} from "../../shared/performance-directive";
import type { AvatarClipId } from "./clipLibrary";

export type BoneRotation = readonly [x: number, y: number, z: number];
export type PoseDefinition = Partial<Record<VRMHumanBoneName, BoneRotation>>;
export type MotionKeyframe = {
  time: number;
  rotation: BoneRotation;
};
export type ClipDefinition = Partial<Record<VRMHumanBoneName, readonly MotionKeyframe[]>>;

type ProceduralSlot = {
  kind: "procedural";
  pose: PoseDefinition;
  blend?: "additive" | "override";
};

export type ClipSlot = {
  kind: "clip";
  duration: number;
  loop?: boolean;
  blend?: "additive" | "override";
  pose?: ClipDefinition;
  clipId?: AvatarClipId;
};

export type MotionSlot = ProceduralSlot | ClipSlot;

export type AvatarMotionRegistry = {
  base: ProceduralSlot;
  idleRestPose: ProceduralSlot;
  states: Record<AssistantStateSnapshot["type"], MotionSlot>;
  moods: Record<PerformanceMood, MotionSlot>;
  gestures: Record<PerformanceGesture, MotionSlot>;
};

export const avatarMotionRegistry: AvatarMotionRegistry = {
  base: {
    kind: "procedural",
    pose: {
      [VRMHumanBoneName.Hips]: [0, 0, 0.015],
      [VRMHumanBoneName.Spine]: [0.04, 0, 0],
      [VRMHumanBoneName.Chest]: [0.03, 0, 0],
      [VRMHumanBoneName.UpperChest]: [0.018, 0, 0],
      [VRMHumanBoneName.Neck]: [-0.01, 0, 0],
      [VRMHumanBoneName.Head]: [-0.01, 0.015, 0]
    }
  },
  idleRestPose: {
    kind: "procedural",
    pose: {
      [VRMHumanBoneName.LeftShoulder]: [0.028, 0.01, 0.1],
      [VRMHumanBoneName.RightShoulder]: [0.026, -0.01, -0.095],
      [VRMHumanBoneName.LeftUpperArm]: [0.17, 0.06, 0.68],
      [VRMHumanBoneName.RightUpperArm]: [0.15, -0.06, -0.64],
      [VRMHumanBoneName.LeftLowerArm]: [0.28, -0.18, 0],
      [VRMHumanBoneName.RightLowerArm]: [0.25, 0.16, 0],
      [VRMHumanBoneName.LeftHand]: [0.14, -0.1, 0],
      [VRMHumanBoneName.RightHand]: [0.12, 0.08, 0]
    }
  },
  states: {
    idle: {
      kind: "clip",
      duration: 6,
      blend: "override",
      clipId: "relaxed-idle-v1"
    },
    listening: {
      kind: "procedural",
      pose: {
        [VRMHumanBoneName.Hips]: [0.01, 0, 0],
        [VRMHumanBoneName.Spine]: [0.045, 0, 0],
        [VRMHumanBoneName.Chest]: [0.03, 0, 0],
        [VRMHumanBoneName.UpperChest]: [0.015, 0, 0],
        [VRMHumanBoneName.Neck]: [0.035, 0.08, 0],
        [VRMHumanBoneName.Head]: [0.05, 0.14, 0],
        [VRMHumanBoneName.LeftShoulder]: [0.015, 0, 0.05],
        [VRMHumanBoneName.RightShoulder]: [0.015, 0, -0.05],
        [VRMHumanBoneName.LeftUpperArm]: [0.03, 0, 0.1],
        [VRMHumanBoneName.RightUpperArm]: [0.03, 0, -0.06],
        [VRMHumanBoneName.LeftLowerArm]: [0.01, 0, -0.04],
        [VRMHumanBoneName.RightLowerArm]: [0.01, 0, 0.02]
      }
    },
    transcribing: {
      kind: "procedural",
      pose: {
        [VRMHumanBoneName.Chest]: [-0.01, 0, 0],
        [VRMHumanBoneName.Neck]: [0.01, -0.08, 0],
        [VRMHumanBoneName.Head]: [0.05, -0.14, 0],
        [VRMHumanBoneName.RightUpperArm]: [0.03, -0.02, -0.08],
        [VRMHumanBoneName.RightLowerArm]: [0.04, -0.04, 0.12]
      }
    },
    thinking: {
      kind: "procedural",
      pose: {
        [VRMHumanBoneName.Hips]: [-0.01, 0, 0],
        [VRMHumanBoneName.Chest]: [-0.02, 0, 0],
        [VRMHumanBoneName.UpperChest]: [-0.01, 0, 0],
        [VRMHumanBoneName.Neck]: [0.03, -0.12, 0],
        [VRMHumanBoneName.Head]: [0.09, -0.18, 0],
        [VRMHumanBoneName.LeftShoulder]: [0.01, 0, 0.03],
        [VRMHumanBoneName.RightShoulder]: [0.02, 0, -0.06],
        [VRMHumanBoneName.LeftHand]: [0, 0.06, 0.04],
        [VRMHumanBoneName.RightHand]: [0.02, -0.08, -0.06]
      }
    },
    speaking: {
      kind: "procedural",
      pose: {
        [VRMHumanBoneName.Hips]: [0.01, 0, 0],
        [VRMHumanBoneName.Spine]: [0.025, 0, 0],
        [VRMHumanBoneName.Chest]: [0.045, 0.01, 0],
        [VRMHumanBoneName.UpperChest]: [0.04, 0.01, 0],
        [VRMHumanBoneName.Neck]: [0.015, 0.04, 0],
        [VRMHumanBoneName.Head]: [0.03, 0.06, 0]
      }
    },
    error: {
      kind: "procedural",
      pose: {
        [VRMHumanBoneName.Chest]: [-0.03, 0, 0],
        [VRMHumanBoneName.Neck]: [-0.04, 0, 0],
        [VRMHumanBoneName.Head]: [-0.06, 0, 0],
        [VRMHumanBoneName.LeftUpperArm]: [-0.03, 0, 0.18],
        [VRMHumanBoneName.RightUpperArm]: [-0.03, 0, -0.18]
      }
    }
  },
  moods: {
    neutral: { kind: "procedural", pose: {} },
    warm: {
      kind: "procedural",
      pose: {
        [VRMHumanBoneName.Chest]: [0.03, 0.01, 0],
        [VRMHumanBoneName.UpperChest]: [0.02, 0.01, 0],
        [VRMHumanBoneName.Head]: [0.01, 0.04, 0],
        [VRMHumanBoneName.LeftShoulder]: [0.01, 0, 0.03],
        [VRMHumanBoneName.RightShoulder]: [0.01, 0, -0.03],
        [VRMHumanBoneName.LeftHand]: [0.03, 0.03, 0.07],
        [VRMHumanBoneName.RightHand]: [0.02, -0.02, -0.04]
      }
    },
    playful: {
      kind: "procedural",
      pose: {
        [VRMHumanBoneName.Chest]: [0.02, 0.02, 0],
        [VRMHumanBoneName.Neck]: [0.03, 0.08, 0],
        [VRMHumanBoneName.Head]: [0.07, 0.16, 0],
        [VRMHumanBoneName.LeftShoulder]: [0.02, 0, 0.05],
        [VRMHumanBoneName.RightShoulder]: [0.01, 0, -0.03],
        [VRMHumanBoneName.LeftUpperArm]: [0.05, 0.02, 0.14],
        [VRMHumanBoneName.RightUpperArm]: [0.03, -0.02, -0.08],
        [VRMHumanBoneName.LeftLowerArm]: [0.05, 0.02, -0.08]
      }
    },
    concerned: {
      kind: "procedural",
      pose: {
        [VRMHumanBoneName.Chest]: [-0.02, 0, 0],
        [VRMHumanBoneName.Neck]: [-0.02, 0, 0],
        [VRMHumanBoneName.Head]: [-0.03, 0, 0]
      }
    },
    focused: {
      kind: "procedural",
      pose: {
        [VRMHumanBoneName.Neck]: [0.01, -0.03, 0],
        [VRMHumanBoneName.Head]: [0.03, -0.06, 0]
      }
    }
  },
  gestures: {
    none: { kind: "procedural", pose: {} },
    nod: { kind: "procedural", pose: {} },
    open_hand: { kind: "procedural", pose: {} },
    small_shrug: { kind: "procedural", pose: {} },
    thinking_touch: { kind: "procedural", pose: {} }
  }
};
