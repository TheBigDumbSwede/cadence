import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMHumanBoneName,
  VRMLoaderPlugin,
  VRMUtils,
  type VRM
} from "@pixiv/three-vrm";
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip
} from "@pixiv/three-vrm-animation";
import type { AvatarSelection } from "../shared/app-settings";
import type { AssistantStateSnapshot } from "../shared/assistant-state";
import type { AvatarPerformanceSnapshot } from "../shared/performance-directive";
import { getCadenceBridge } from "../services/bridge";
import {
  applyAvatarEmotion,
  applyAvatarPose,
  createRigBones,
  type RigBone
} from "../services/avatar/avatarMotion";
import { avatarVrmaAssets } from "../services/avatar/vrmaAssets";

type VrmStageProps = {
  activeState: AssistantStateSnapshot;
  avatar: AvatarSelection | null;
  debugPose: boolean;
  performance: AvatarPerformanceSnapshot;
};

type DebugBoneSnapshot = {
  label: string;
  x: number;
  y: number;
  z: number;
};

const DEBUG_BONES: Array<{ bone: VRMHumanBoneName; label: string }> = [
  { bone: VRMHumanBoneName.LeftUpperArm, label: "L upper" },
  { bone: VRMHumanBoneName.LeftLowerArm, label: "L lower" },
  { bone: VRMHumanBoneName.LeftHand, label: "L hand" },
  { bone: VRMHumanBoneName.RightUpperArm, label: "R upper" },
  { bone: VRMHumanBoneName.RightLowerArm, label: "R lower" },
  { bone: VRMHumanBoneName.RightHand, label: "R hand" }
];

export function VrmStage({ activeState, avatar, debugPose, performance }: VrmStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(activeState.type);
  const performanceRef = useRef(performance);
  const [debugSnapshot, setDebugSnapshot] = useState<DebugBoneSnapshot[]>([]);
  const [loadState, setLoadState] = useState<"empty" | "loading" | "ready" | "error">(
    avatar ? "loading" : "empty"
  );

  useEffect(() => {
    stateRef.current = activeState.type;
  }, [activeState.type]);

  useEffect(() => {
    performanceRef.current = performance;
  }, [performance]);

  useEffect(() => {
    if (!debugPose) {
      setDebugSnapshot([]);
    }
  }, [debugPose]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let disposed = false;
    let frameId = 0;
    let currentVrm: VRM | null = null;
    let rigBones = new Map<VRMHumanBoneName, RigBone>();
    let clipMixer: THREE.AnimationMixer | null = null;
    let idleAction: THREE.AnimationAction | null = null;
    let listeningAction: THREE.AnimationAction | null = null;
    let thinkingAction: THREE.AnimationAction | null = null;
    let idleVrmaLoaded = false;
    let listeningVrmaLoaded = false;
    let thinkingVrmaLoaded = false;
    let avatarBaseY = 0;
    let avatarBaseRotationY = Math.PI + 0.08;
    let gestureStartTime = Number.NEGATIVE_INFINITY;
    let lastGestureRevision = performanceRef.current.gestureRevision;
    let previousState = stateRef.current;
    let lastDebugSampleAt = 0;
    let framedSize: THREE.Vector3 | null = null;
    let framedCenter: THREE.Vector3 | null = null;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 30);
    camera.position.set(0, 1.38, 2.75);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "vrm-canvas";
    host.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xf7e8db, 0x281c15, 1.45);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffe2c4, 1.8);
    keyLight.position.set(1.2, 2.4, 2.2);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x89a9dc, 0.85);
    rimLight.position.set(-1.3, 1.4, -1.6);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 48),
      new THREE.MeshBasicMaterial({
        color: 0x0e0b09,
        opacity: 0.34,
        transparent: true
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.02, 0);
    scene.add(floor);

    const loader = new GLTFLoader();
    loader.register(
      (parser: ConstructorParameters<typeof VRMLoaderPlugin>[0]) =>
        new VRMLoaderPlugin(parser)
    );
    const animationLoader = new GLTFLoader();
    animationLoader.register(
      (parser: ConstructorParameters<typeof VRMAnimationLoaderPlugin>[0]) =>
        new VRMAnimationLoaderPlugin(parser)
    );

    if (!avatar) {
      setLoadState("empty");
    } else {
      setLoadState("loading");
    }

    const loadVrmaAction = (
      assetUrl: string,
      actionName: "idle" | "listening" | "thinking"
    ) => {
      void fetch(assetUrl)
        .then((response) => response.arrayBuffer())
        .then((buffer) => {
          if (disposed || !currentVrm) {
            return;
          }

          animationLoader.parse(
            buffer,
            "",
            (animationGltf: GLTF) => {
              if (disposed || !currentVrm) {
                return;
              }

              const vrmAnimations = animationGltf.userData.vrmAnimations as
                | Array<unknown>
                | undefined;
              const vrmAnimation = vrmAnimations?.[0];
              if (!vrmAnimation) {
                return;
              }

              const clip = createVRMAnimationClip(
                vrmAnimation as Parameters<typeof createVRMAnimationClip>[0],
                currentVrm
              );
              const sanitizedClip = new THREE.AnimationClip(
                clip.name,
                clip.duration,
                clip.tracks.filter((track) => !track.name.endsWith(".position"))
              );

              if (!clipMixer) {
                clipMixer = new THREE.AnimationMixer(currentVrm.scene);
              }

              const action = clipMixer.clipAction(sanitizedClip);
              action.enabled = true;
              action.setLoop(THREE.LoopRepeat, Infinity);
              action.clampWhenFinished = false;
              action.play();
              action.paused = true;
              if (actionName === "idle") {
                idleAction = action;
                idleVrmaLoaded = true;
                idleAction.paused = stateRef.current !== "idle";
              } else if (actionName === "listening") {
                listeningAction = action;
                listeningVrmaLoaded = true;
                listeningAction.paused = stateRef.current !== "listening";
              } else {
                thinkingAction = action;
                thinkingVrmaLoaded = true;
                thinkingAction.paused =
                  stateRef.current !== "thinking" && stateRef.current !== "transcribing";
              }
            },
            () => {
              if (actionName === "idle") {
                idleVrmaLoaded = false;
              } else if (actionName === "listening") {
                listeningVrmaLoaded = false;
              } else {
                thinkingVrmaLoaded = false;
              }
            }
          );
        })
        .catch(() => {
          if (actionName === "idle") {
            idleVrmaLoaded = false;
          } else if (actionName === "listening") {
            listeningVrmaLoaded = false;
          } else {
            thinkingVrmaLoaded = false;
          }
        });
    };

    const fitCameraToAvatar = () => {
      if (!framedSize || !framedCenter) {
        return;
      }

      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov =
        2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 0.01));
      const distanceForHeight =
        (framedSize.y * 0.5) / Math.tan(verticalFov / 2);
      const distanceForWidth =
        (framedSize.x * 0.5) / Math.tan(horizontalFov / 2);
      const paddedDistance = Math.max(distanceForHeight, distanceForWidth) * 1.03;
      const focusY = framedCenter.y + framedSize.y * 0.025;

      camera.position.set(0, focusY + framedSize.y * 0.06, Math.max(2.05, paddedDistance));
      camera.near = 0.1;
      camera.far = Math.max(30, paddedDistance * 8);
      camera.lookAt(0, focusY, 0);
      camera.updateProjectionMatrix();
    };

    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      fitCameraToAvatar();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    if (avatar) {
      void getCadenceBridge()
        .settings.readAvatarFile(avatar.path)
        .then((avatarBytes) => {
          if (disposed) {
            return;
          }

          loader.parse(
            avatarBytes,
            "",
            (gltf: GLTF) => {
              if (disposed) {
                return;
              }

              const vrm = gltf.userData.vrm as VRM | undefined;
              if (!vrm) {
                setLoadState("error");
                return;
              }

              currentVrm = vrm;
              VRMUtils.rotateVRM0(vrm);
              VRMUtils.combineSkeletons(vrm.scene);
              VRMUtils.combineMorphs(vrm);

              const root = vrm.scene;
              root.traverse((object: THREE.Object3D) => {
                object.frustumCulled = false;
              });

              rigBones = createRigBones(vrm);

              if (debugPose) {
                for (const { bone } of DEBUG_BONES) {
                  const debugBone = rigBones.get(bone);
                  if (!debugBone) {
                    continue;
                  }

                  const helper = new THREE.AxesHelper(0.1);
                  helper.renderOrder = 10;
                  debugBone.node.add(helper);
                }
              }

              const fitBox = new THREE.Box3().setFromObject(root);
              const fitSize = fitBox.getSize(new THREE.Vector3());
              const rawHeight = Math.max(fitSize.y, 0.001);
              const targetHeight = 1.42;
              const scale = targetHeight / rawHeight;
              root.scale.setScalar(scale);
              root.updateMatrixWorld(true);

              fitBox.setFromObject(root);
              const centeredCenter = fitBox.getCenter(new THREE.Vector3());

              root.position.x -= centeredCenter.x;
              root.position.z -= centeredCenter.z;
              root.position.y -= fitBox.min.y - 0.04;
              root.rotation.y = avatarBaseRotationY;
              root.updateMatrixWorld(true);

              fitBox.setFromObject(root);
              framedSize = fitBox.getSize(new THREE.Vector3());
              framedCenter = fitBox.getCenter(new THREE.Vector3());
              fitCameraToAvatar();

              floor.scale.setScalar(Math.max(1, framedSize.y * 0.82));
              avatarBaseY = root.position.y;

              scene.add(root);
              setLoadState("ready");
              loadVrmaAction(avatarVrmaAssets.idle, "idle");
              loadVrmaAction(avatarVrmaAssets.listening, "listening");
              loadVrmaAction(avatarVrmaAssets.thinking, "thinking");
            },
            () => {
              if (!disposed) {
                setLoadState("error");
              }
            }
          );
        })
        .catch(() => {
          if (!disposed) {
            setLoadState("error");
          }
        });
    }

    const clock = new THREE.Clock();

    const animate = () => {
      if (disposed) {
        return;
      }

      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;
      const state = stateRef.current;
      const activePerformance = performanceRef.current;
      if (state !== previousState) {
        if (idleAction) {
          if (state === "idle") {
            idleAction.reset();
            idleAction.paused = false;
            idleAction.play();
          } else {
            idleAction.paused = true;
            idleAction.stop();
          }
        }
        if (listeningAction) {
          if (state === "listening") {
            listeningAction.reset();
            listeningAction.paused = false;
            listeningAction.play();
          } else {
            listeningAction.paused = true;
            listeningAction.stop();
          }
        }
        if (thinkingAction) {
          if (state === "thinking" || state === "transcribing") {
            thinkingAction.reset();
            thinkingAction.paused = false;
            thinkingAction.play();
          } else {
            thinkingAction.paused = true;
            thinkingAction.stop();
          }
        }
        previousState = state;
      }

      if (activePerformance.gestureRevision !== lastGestureRevision) {
        lastGestureRevision = activePerformance.gestureRevision;
        gestureStartTime = elapsed;
      }

      const gestureProgress = (() => {
        if (activePerformance.gesture === "none") {
          return 0;
        }

        const ratio = (elapsed - gestureStartTime) / 0.85;
        if (ratio <= 0 || ratio >= 1) {
          return 0;
        }

        return Math.sin(ratio * Math.PI);
      })();

      if (currentVrm) {
        const root = currentVrm.scene;
        const paceMultiplier =
          activePerformance.pace === "animated"
            ? 1.24
            : activePerformance.pace === "calm"
              ? 0.84
              : 1;
        const intensityMultiplier = 0.72 + activePerformance.intensity * 0.9;
        const bobStrength =
          (state === "speaking" ? 0.036 : state === "listening" ? 0.022 : state === "thinking" || state === "transcribing" ? 0.017 : 0.012) *
          intensityMultiplier;
        const swayStrength =
          state === "thinking" || state === "transcribing"
            ? 0.11
            : state === "speaking"
              ? 0.07
              : 0.032;

        root.position.y =
          avatarBaseY + Math.sin(elapsed * 1.3 * paceMultiplier) * bobStrength;
        root.rotation.y =
          avatarBaseRotationY +
          Math.sin(elapsed * 0.7 * paceMultiplier) * swayStrength * intensityMultiplier;
        root.rotation.x =
          state === "listening"
            ? -0.03
            : state === "thinking" || state === "transcribing"
              ? 0.02
              : 0;

        const activeClipMixer = clipMixer;
        const useIdleClip = state === "idle" && Boolean(activeClipMixer) && idleVrmaLoaded;
        const useListeningClip =
          state === "listening" && Boolean(activeClipMixer) && listeningVrmaLoaded;
        const useThinkingClip =
          (state === "thinking" || state === "transcribing") &&
          Boolean(activeClipMixer) &&
          thinkingVrmaLoaded;

        if (activeClipMixer && (useIdleClip || useListeningClip || useThinkingClip)) {
          activeClipMixer.update(delta);
        } else {
          applyAvatarPose(
            rigBones,
            state,
            activePerformance,
            gestureProgress,
            elapsed,
            delta
          );
        }
        applyAvatarEmotion(currentVrm, state, activePerformance, elapsed);
        currentVrm.update(delta);

        if (debugPose && elapsed - lastDebugSampleAt > 0.12) {
          lastDebugSampleAt = elapsed;
          const euler = new THREE.Euler();
          const inverseRest = new THREE.Quaternion();
          const offset = new THREE.Quaternion();

          setDebugSnapshot(
            DEBUG_BONES.map(({ bone, label }) => {
              const rigBone = rigBones.get(bone);
              if (!rigBone) {
                return {
                  label,
                  x: 0,
                  y: 0,
                  z: 0
                };
              }

              inverseRest.copy(rigBone.restQuaternion).invert();
              offset.copy(inverseRest).multiply(rigBone.node.quaternion);
              euler.setFromQuaternion(offset, "XYZ");

              return {
                label,
                x: THREE.MathUtils.radToDeg(euler.x),
                y: THREE.MathUtils.radToDeg(euler.y),
                z: THREE.MathUtils.radToDeg(euler.z)
              };
            })
          );
        }
      }

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();

      if (currentVrm) {
        scene.remove(currentVrm.scene);
        VRMUtils.deepDispose(currentVrm.scene);
      }
      clipMixer?.stopAllAction();
      clipMixer = null;
      idleAction = null;
      listeningAction = null;
      thinkingAction = null;

      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [avatar, debugPose]);

  return (
    <div className="vrm-stage-shell">
      <div ref={hostRef} className="vrm-stage-host" />
      {debugPose && loadState === "ready" ? (
        <div className="vrm-debug-panel">
          <strong>Pose Debug</strong>
          <span>X/Y/Z offset from rest, in degrees.</span>
          <div className="vrm-debug-grid">
            {debugSnapshot.map((bone) => (
              <div key={bone.label} className="vrm-debug-row">
                <span>{bone.label}</span>
                <code>
                  {bone.x.toFixed(0)} / {bone.y.toFixed(0)} / {bone.z.toFixed(0)}
                </code>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {loadState !== "ready" ? (
        <div className="vrm-stage-overlay">
          <strong>
            {loadState === "empty"
              ? "No avatar selected"
              : loadState === "loading"
                ? `Loading ${avatar?.label ?? "avatar"}`
                : "VRM load failed"}
          </strong>
          <span>
            {loadState === "empty"
              ? "Choose a local .vrm file in Settings to populate the stage."
              : loadState === "loading"
                ? "Preparing the avatar for the stage."
                : "The selected VRM could not be loaded."}
          </span>
        </div>
      ) : null}
    </div>
  );
}
