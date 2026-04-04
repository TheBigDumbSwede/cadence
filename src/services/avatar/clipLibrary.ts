import type { ClipDefinition } from "./motionRegistry";
import { relaxedIdleClip } from "./clips/relaxedIdleClip";

export type AvatarClipId = "relaxed-idle-v1";

export const avatarClipLibrary: Record<AvatarClipId, ClipDefinition> = {
  "relaxed-idle-v1": relaxedIdleClip
};
