import { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { ClipDefinition } from "../motionRegistry";

export const relaxedIdleClip: ClipDefinition = {
  [VRMHumanBoneName.Hips]: [
    { time: 0, rotation: [0.01, -0.025, 0] },
    { time: 1.6, rotation: [0.014, 0.018, 0] },
    { time: 3.2, rotation: [0.008, -0.01, 0] },
    { time: 4.8, rotation: [0.012, 0.014, 0] },
    { time: 6, rotation: [0.01, -0.025, 0] }
  ],
  [VRMHumanBoneName.Spine]: [
    { time: 0, rotation: [0.018, 0, 0] },
    { time: 1.6, rotation: [0.026, 0.01, 0] },
    { time: 3.2, rotation: [0.014, -0.008, 0] },
    { time: 4.8, rotation: [0.022, 0.008, 0] },
    { time: 6, rotation: [0.018, 0, 0] }
  ],
  [VRMHumanBoneName.Chest]: [
    { time: 0, rotation: [0.014, 0.006, 0] },
    { time: 1.6, rotation: [0.022, 0.016, 0] },
    { time: 3.2, rotation: [0.012, -0.008, 0] },
    { time: 4.8, rotation: [0.018, 0.012, 0] },
    { time: 6, rotation: [0.014, 0.006, 0] }
  ],
  [VRMHumanBoneName.UpperChest]: [
    { time: 0, rotation: [0.01, 0, 0] },
    { time: 1.6, rotation: [0.016, 0.01, 0] },
    { time: 3.2, rotation: [0.008, -0.006, 0] },
    { time: 4.8, rotation: [0.014, 0.008, 0] },
    { time: 6, rotation: [0.01, 0, 0] }
  ],
  [VRMHumanBoneName.Neck]: [
    { time: 0, rotation: [0.006, 0.024, 0] },
    { time: 1.6, rotation: [0.01, 0.05, 0] },
    { time: 3.2, rotation: [0.004, -0.014, 0] },
    { time: 4.8, rotation: [0.008, 0.032, 0] },
    { time: 6, rotation: [0.006, 0.024, 0] }
  ],
  [VRMHumanBoneName.Head]: [
    { time: 0, rotation: [0.01, 0.038, 0] },
    { time: 1.6, rotation: [0.018, 0.072, 0] },
    { time: 3.2, rotation: [0.006, -0.022, 0] },
    { time: 4.8, rotation: [0.014, 0.048, 0] },
    { time: 6, rotation: [0.01, 0.038, 0] }
  ],
  [VRMHumanBoneName.LeftShoulder]: [
    { time: 0, rotation: [0.01, 0, 0.025] },
    { time: 1.6, rotation: [0.016, 0, 0.038] },
    { time: 3.2, rotation: [0.008, 0, 0.018] },
    { time: 4.8, rotation: [0.014, 0, 0.032] },
    { time: 6, rotation: [0.01, 0, 0.025] }
  ],
  [VRMHumanBoneName.RightShoulder]: [
    { time: 0, rotation: [0.01, 0, -0.024] },
    { time: 1.6, rotation: [0.016, 0, -0.036] },
    { time: 3.2, rotation: [0.008, 0, -0.017] },
    { time: 4.8, rotation: [0.014, 0, -0.03] },
    { time: 6, rotation: [0.01, 0, -0.024] }
  ],
  [VRMHumanBoneName.LeftUpperArm]: [
    { time: 0, rotation: [0.08, 0.04, 0.02] },
    { time: 1.6, rotation: [0.11, 0.06, 0.05] },
    { time: 3.2, rotation: [0.06, 0.02, 0] },
    { time: 4.8, rotation: [0.095, 0.05, 0.03] },
    { time: 6, rotation: [0.08, 0.04, 0.02] }
  ],
  [VRMHumanBoneName.RightUpperArm]: [
    { time: 0, rotation: [0.075, -0.04, -0.02] },
    { time: 1.6, rotation: [0.105, -0.06, -0.05] },
    { time: 3.2, rotation: [0.055, -0.02, 0] },
    { time: 4.8, rotation: [0.09, -0.05, -0.03] },
    { time: 6, rotation: [0.075, -0.04, -0.02] }
  ],
  [VRMHumanBoneName.LeftLowerArm]: [
    { time: 0, rotation: [0.18, -0.12, 0] },
    { time: 1.6, rotation: [0.24, -0.16, -0.01] },
    { time: 3.2, rotation: [0.14, -0.09, 0.01] },
    { time: 4.8, rotation: [0.2, -0.13, 0] },
    { time: 6, rotation: [0.18, -0.12, 0] }
  ],
  [VRMHumanBoneName.RightLowerArm]: [
    { time: 0, rotation: [0.17, 0.1, 0] },
    { time: 1.6, rotation: [0.22, 0.14, 0.01] },
    { time: 3.2, rotation: [0.13, 0.08, -0.01] },
    { time: 4.8, rotation: [0.19, 0.12, 0] },
    { time: 6, rotation: [0.17, 0.1, 0] }
  ],
  [VRMHumanBoneName.LeftHand]: [
    { time: 0, rotation: [0.08, -0.06, 0] },
    { time: 1.6, rotation: [0.11, -0.1, 0.01] },
    { time: 3.2, rotation: [0.06, -0.04, -0.01] },
    { time: 4.8, rotation: [0.09, -0.08, 0] },
    { time: 6, rotation: [0.08, -0.06, 0] }
  ],
  [VRMHumanBoneName.RightHand]: [
    { time: 0, rotation: [0.08, 0.06, 0] },
    { time: 1.6, rotation: [0.11, 0.09, -0.01] },
    { time: 3.2, rotation: [0.06, 0.04, 0.01] },
    { time: 4.8, rotation: [0.09, 0.08, 0] },
    { time: 6, rotation: [0.08, 0.06, 0] }
  ]
};
