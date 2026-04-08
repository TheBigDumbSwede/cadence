import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SettingsService } from "./SettingsService";

const electronState = vi.hoisted(() => ({
  userDataPath: ""
}));

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => {
      if (name !== "userData") {
        throw new Error(`Unexpected path lookup: ${name}`);
      }

      return electronState.userDataPath;
    }
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8")
  }
}));

function createSettingsUpdate() {
  return {
    preferences: {
      mode: "voice" as const,
      textBackend: "openai" as const,
      ttsProvider: "elevenlabs" as const,
      voiceInputMode: "push_to_talk" as const,
      voiceBackend: "kindroid" as const
    },
    openAiTtsVoice: "nova",
    openAiTtsInstructions: "",
    memoryBaseUrl: "",
    elevenLabsVoiceId: "",
    kindroidAiId: "",
    kindroidBaseUrl: "https://api.kindroid.ai/v1",
    kindroidGreeting: "Hello.",
    kindroidConversationMode: "group" as const,
    kindroidParticipants: [
      {
        id: "participant-1",
        aiId: "ai-1",
        displayName: "Amanda",
        bubbleName: "Amanda",
        waveformColor: "invalid",
        waveformAccent: "orbit" as never,
        ttsProvider: "openai" as const,
        filterNarrationForTts: true,
        narrationDelimiter: "*",
        narrationFxEnabled: false,
        openAiVoice: "nova",
        openAiInstructions: "",
        elevenLabsVoiceId: ""
      }
    ],
    activeKindroidParticipantId: "participant-1",
    kindroidGroupMirrors: [
      {
        id: "group-1",
        groupId: "kindroid-group-1",
        displayName: "Roster",
        participantIds: ["participant-1", "missing"],
        manualTurnTaking: true,
        autoTurnLimit: 90,
        turnPauseMs: -50
      }
    ],
    activeKindroidGroupMirrorId: "group-1",
    activeKindroidGroupSpeakerParticipantId: "missing"
  };
}

describe("SettingsService", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "cadence-settings-test-"));
    electronState.userDataPath = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("normalizes participant waveform settings and mirrored group membership", () => {
    const service = new SettingsService();

    const snapshot = service.update(createSettingsUpdate());

    expect(snapshot.kindroidParticipants[0].waveformColor).toBe("#d7955b");
    expect(snapshot.kindroidParticipants[0].waveformAccent).toBe("halo");
    expect(snapshot.kindroidGroupMirrors[0].participantIds).toEqual(["participant-1"]);
    expect(snapshot.kindroidGroupMirrors[0].autoTurnLimit).toBe(60);
    expect(snapshot.kindroidGroupMirrors[0].turnPauseMs).toBe(0);
    expect(snapshot.activeKindroidGroupSpeakerParticipantId).toBe("participant-1");
  });

  it("migrates a legacy single ai_id into the participant roster", () => {
    const settingsPath = path.join(tempDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          preferences: {
            mode: "voice",
            textBackend: "kindroid",
            ttsProvider: "openai",
            voiceInputMode: "push_to_talk",
            voiceBackend: "kindroid"
          },
          kindroidAiId: "legacy-ai-id"
        },
        null,
        2
      ),
      "utf8"
    );

    const service = new SettingsService();
    const snapshot = service.getSnapshot();

    expect(snapshot.kindroidParticipants).toHaveLength(1);
    expect(snapshot.kindroidParticipants[0]).toMatchObject({
      aiId: "legacy-ai-id",
      displayName: "Kindroid",
      bubbleName: "Kindroid",
      waveformAccent: "halo"
    });
    expect(readFileSync(settingsPath, "utf8")).toContain('"kindroidAiId": "legacy-ai-id"');
  });
});
