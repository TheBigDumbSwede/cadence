import { useEffect, useMemo, useState } from "react";
import type { SettingsSnapshot } from "../shared/app-settings";
import type {
  KindroidConversationMode,
  KindroidGroupMirror
} from "../shared/kindroid-group-mirrors";
import {
  DEFAULT_KINDROID_GROUP_AUTO_TURN_LIMIT,
  DEFAULT_KINDROID_GROUP_TURN_PAUSE_MS
} from "../shared/kindroid-group-mirrors";
import {
  getDefaultKindroidWaveformAccent,
  getDefaultKindroidWaveformColor,
  KINDROID_WAVEFORM_ACCENT_OPTIONS,
  type KindroidParticipant
} from "../shared/kindroid-participants";

type KindroidPanelProps = {
  settingsLoaded: boolean;
  settingsSaveState: "idle" | "saving" | "saved" | "error";
  settingsFeedback: string;
  settingsSnapshot: SettingsSnapshot | null;
  onSaveKindroidConfig: (update: {
    kindroidConversationMode: KindroidConversationMode;
    kindroidParticipants: KindroidParticipant[];
    activeKindroidParticipantId: string | null;
    kindroidGroupMirrors: KindroidGroupMirror[];
    activeKindroidGroupMirrorId: string | null;
    activeKindroidGroupSpeakerParticipantId: string | null;
  }) => Promise<void>;
};

const OPENAI_TTS_VOICE_OPTIONS = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
  "coral",
  "verse",
  "ballad",
  "ash",
  "sage",
  "marin",
  "cedar"
] as const;

function createParticipant(
  defaultTtsProvider: KindroidParticipant["ttsProvider"],
  index: number
): KindroidParticipant {
  return {
    id: crypto.randomUUID(),
    aiId: "",
    displayName: "",
    bubbleName: "",
    waveformColor: getDefaultKindroidWaveformColor(index),
    waveformAccent: getDefaultKindroidWaveformAccent(index),
    ttsProvider: defaultTtsProvider,
    filterNarrationForTts: true,
    narrationDelimiter: "*",
    narrationFxEnabled: false,
    openAiVoice: "",
    openAiInstructions: "",
    elevenLabsVoiceId: ""
  };
}

function createGroupMirror(): KindroidGroupMirror {
  return {
    id: crypto.randomUUID(),
    groupId: "",
    displayName: "",
    participantIds: [],
    manualTurnTaking: false,
    autoTurnLimit: DEFAULT_KINDROID_GROUP_AUTO_TURN_LIMIT,
    turnPauseMs: DEFAULT_KINDROID_GROUP_TURN_PAUSE_MS
  };
}

export function KindroidPanel({
  settingsLoaded,
  settingsSaveState,
  settingsFeedback,
  settingsSnapshot,
  onSaveKindroidConfig
}: KindroidPanelProps) {
  const [kindroidConversationMode, setKindroidConversationMode] =
    useState<KindroidConversationMode>("solo");
  const [participants, setParticipants] = useState<KindroidParticipant[]>([]);
  const [activeKindroidParticipantId, setActiveKindroidParticipantId] = useState<string | null>(
    null
  );
  const [groupMirrors, setGroupMirrors] = useState<KindroidGroupMirror[]>([]);
  const [activeKindroidGroupMirrorId, setActiveKindroidGroupMirrorId] = useState<string | null>(
    null
  );
  const [validationMessage, setValidationMessage] = useState("");

  useEffect(() => {
    if (!settingsSnapshot) {
      return;
    }

    setKindroidConversationMode(settingsSnapshot.kindroidConversationMode);
    setParticipants(settingsSnapshot.kindroidParticipants);
    setActiveKindroidParticipantId(settingsSnapshot.activeKindroidParticipantId);
    setGroupMirrors(settingsSnapshot.kindroidGroupMirrors);
    setActiveKindroidGroupMirrorId(settingsSnapshot.activeKindroidGroupMirrorId);
    setValidationMessage("");
  }, [settingsSnapshot]);

  const saveDisabled = !settingsLoaded || settingsSaveState === "saving";
  const defaultTtsProvider = settingsSnapshot?.preferences.ttsProvider ?? "none";
  const hasUnsavedChanges = useMemo(() => {
    if (!settingsSnapshot) {
      return false;
    }

    return (
      kindroidConversationMode !== settingsSnapshot.kindroidConversationMode ||
      activeKindroidParticipantId !== settingsSnapshot.activeKindroidParticipantId ||
      activeKindroidGroupMirrorId !== settingsSnapshot.activeKindroidGroupMirrorId ||
      JSON.stringify(participants) !== JSON.stringify(settingsSnapshot.kindroidParticipants) ||
      JSON.stringify(groupMirrors) !== JSON.stringify(settingsSnapshot.kindroidGroupMirrors)
    );
  }, [
    activeKindroidGroupMirrorId,
    activeKindroidParticipantId,
    groupMirrors,
    kindroidConversationMode,
    participants,
    settingsSnapshot
  ]);
  const participantNames = useMemo(
    () =>
      participants.map((participant, index) => ({
        id: participant.id,
        label: participant.displayName.trim() || `Participant ${index + 1}`
      })),
    [participants]
  );
  const activeGroupMirror =
    groupMirrors.find((groupMirror) => groupMirror.id === activeKindroidGroupMirrorId) ?? null;
  function updateParticipant(
    participantId: string,
    updater: (participant: KindroidParticipant) => KindroidParticipant
  ): void {
    setParticipants((previous) =>
      previous.map((participant) =>
        participant.id === participantId ? updater(participant) : participant
      )
    );
  }

  function addParticipant(): void {
    const nextParticipant = createParticipant(defaultTtsProvider, participants.length);
    setParticipants((previous) => [...previous, nextParticipant]);
    setActiveKindroidParticipantId((previous) => previous ?? nextParticipant.id);
    setValidationMessage("");
  }

  function removeParticipant(participantId: string): void {
    setParticipants((previous) => {
      const nextParticipants = previous.filter(
        (participant) => participant.id !== participantId
      );

      setActiveKindroidParticipantId((currentActiveId) =>
        currentActiveId === participantId ? nextParticipants[0]?.id ?? null : currentActiveId
      );
      setGroupMirrors((currentGroups) =>
        currentGroups.map((groupMirror) => ({
          ...groupMirror,
          participantIds: groupMirror.participantIds.filter((id) => id !== participantId)
        }))
      );

      return nextParticipants;
    });
    setValidationMessage("");
  }

  function updateGroupMirror(
    groupMirrorId: string,
    updater: (groupMirror: KindroidGroupMirror) => KindroidGroupMirror
  ): void {
    setGroupMirrors((previous) =>
      previous.map((groupMirror) =>
        groupMirror.id === groupMirrorId ? updater(groupMirror) : groupMirror
      )
    );
  }

  function addGroupMirror(): void {
    const nextGroupMirror = createGroupMirror();
    setGroupMirrors((previous) => [...previous, nextGroupMirror]);
    setActiveKindroidGroupMirrorId((previous) => previous ?? nextGroupMirror.id);
    setValidationMessage("");
  }

  function removeGroupMirror(groupMirrorId: string): void {
    setGroupMirrors((previous) => {
      const nextGroups = previous.filter((groupMirror) => groupMirror.id !== groupMirrorId);
      setActiveKindroidGroupMirrorId((currentActiveId) =>
        currentActiveId === groupMirrorId ? nextGroups[0]?.id ?? null : currentActiveId
      );
      return nextGroups;
    });
    setValidationMessage("");
  }

  async function handleSave(): Promise<void> {
    const invalidParticipant = participants.find(
      (participant) =>
        !participant.displayName.trim() ||
        !participant.bubbleName.trim() ||
        !participant.aiId.trim()
    );

    if (invalidParticipant) {
      setValidationMessage(
        "Each Kindroid participant needs a display name, bubble name, and AI ID."
      );
      return;
    }

    const invalidGroupMirror = groupMirrors.find(
      (groupMirror) =>
        !groupMirror.displayName.trim() ||
        !groupMirror.groupId.trim() ||
        groupMirror.participantIds.length === 0
    );

    if (invalidGroupMirror) {
      setValidationMessage(
        "Each mirrored group needs a display name, group ID, and at least one participant."
      );
      return;
    }

    const nextConversationMode =
      kindroidConversationMode === "group" && groupMirrors.length === 0 ? "solo" : kindroidConversationMode;
    const nextActiveParticipantId =
      participants.length === 0
        ? null
        : participants.some((participant) => participant.id === activeKindroidParticipantId)
          ? activeKindroidParticipantId
          : participants[0].id;
    const nextActiveGroupMirrorId =
      groupMirrors.length === 0
        ? null
        : groupMirrors.some((groupMirror) => groupMirror.id === activeKindroidGroupMirrorId)
          ? activeKindroidGroupMirrorId
          : groupMirrors[0].id;
    const nextActiveGroupMirror =
      groupMirrors.find((groupMirror) => groupMirror.id === nextActiveGroupMirrorId) ?? null;
    setValidationMessage("");

    await onSaveKindroidConfig({
      kindroidConversationMode: nextConversationMode,
      kindroidParticipants: participants,
      activeKindroidParticipantId: nextActiveParticipantId,
      kindroidGroupMirrors: groupMirrors,
      activeKindroidGroupMirrorId: nextActiveGroupMirrorId,
      activeKindroidGroupSpeakerParticipantId: null
    });
  }

  return (
    <div className="menu-pane">
      <div className="menu-pane-scroll menu-stack">
      <section className="menu-section">
        <div className="menu-section-header">
          <div>
            <h3 className="panel-title">Routing</h3>
          </div>
        </div>
        <div className="settings-field">
          <label htmlFor="kindroid-conversation-mode">Conversation mode</label>
          <select
            id="kindroid-conversation-mode"
            className="settings-input"
            value={kindroidConversationMode}
            onChange={(event) =>
              setKindroidConversationMode(event.target.value as KindroidConversationMode)
            }
          >
            <option value="solo">Solo participant</option>
            <option value="group" disabled={groupMirrors.length === 0}>
              Mirrored group chat
            </option>
          </select>
          <p className="field-status">
            Group mode mirrors an existing Kindroid group locally. Cadence does not create or
            manage the group itself.
          </p>
        </div>

        {kindroidConversationMode === "solo" ? (
          <div className="settings-field">
            <label htmlFor="active-kindroid-participant">Active Kindroid</label>
            <select
              id="active-kindroid-participant"
              className="settings-input"
              value={activeKindroidParticipantId ?? ""}
              onChange={(event) => setActiveKindroidParticipantId(event.target.value || null)}
            >
              <option value="">No active participant</option>
              {participantNames.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div className="settings-field">
              <label htmlFor="active-kindroid-group">Active mirrored group</label>
              <select
                id="active-kindroid-group"
                className="settings-input"
                value={activeKindroidGroupMirrorId ?? ""}
                onChange={(event) => setActiveKindroidGroupMirrorId(event.target.value || null)}
              >
                <option value="">No active group</option>
                {groupMirrors.map((groupMirror) => (
                  <option key={groupMirror.id} value={groupMirror.id}>
                    {groupMirror.displayName.trim() || groupMirror.groupId}
                  </option>
                ))}
              </select>
              <p className="field-status">
                This must match the real Kindroid group roster exactly, including participant
                membership.
              </p>
            </div>
            {activeGroupMirror?.manualTurnTaking ? (
              <p className="field-status">
                Manual-turn groups use the in-chat roster buttons to trigger the next Kin reply.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="menu-section">
        <div className="menu-section-header">
          <div>
            <p className="eyebrow">Participants</p>
            <h3 className="panel-title">Roster</h3>
          </div>
          <button type="button" className="secondary-button" onClick={addParticipant}>
            Add Participant
          </button>
        </div>
        <p className="setting-copy">
          Solo chat and group mirrors both reference this local participant roster.
        </p>
        <div className="kindroid-participant-list">
          {participants.length === 0 ? (
            <article className="setting-card">
              <strong>No participants yet</strong>
              <p className="setting-copy">
                Add one or more Kindroids here before creating mirrored groups.
              </p>
            </article>
          ) : (
            participants.map((participant, index) => {
              const openAiVoiceOptions = participant.openAiVoice
                ? OPENAI_TTS_VOICE_OPTIONS.includes(
                    participant.openAiVoice as (typeof OPENAI_TTS_VOICE_OPTIONS)[number]
                  )
                  ? OPENAI_TTS_VOICE_OPTIONS
                  : [participant.openAiVoice, ...OPENAI_TTS_VOICE_OPTIONS]
                : OPENAI_TTS_VOICE_OPTIONS;

              return (
                <article key={participant.id} className="setting-card kindroid-participant-card">
                  <div className="kindroid-participant-header">
                    <strong>{participant.displayName.trim() || `Participant ${index + 1}`}</strong>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => removeParticipant(participant.id)}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="settings-field">
                    <label htmlFor={`kindroid-display-name-${participant.id}`}>Display name</label>
                    <input
                      id={`kindroid-display-name-${participant.id}`}
                      className="settings-input"
                      type="text"
                      value={participant.displayName}
                      onChange={(event) =>
                        updateParticipant(participant.id, (current) => ({
                          ...current,
                          displayName: event.target.value
                        }))
                      }
                      placeholder="Narrator"
                    />
                  </div>

                  <div className="settings-field">
                    <label htmlFor={`kindroid-bubble-name-${participant.id}`}>Bubble name</label>
                    <input
                      id={`kindroid-bubble-name-${participant.id}`}
                      className="settings-input"
                      type="text"
                      value={participant.bubbleName}
                      onChange={(event) =>
                        updateParticipant(participant.id, (current) => ({
                          ...current,
                          bubbleName: event.target.value
                        }))
                      }
                      placeholder="Narrator"
                    />
                  </div>

                  <div className="settings-field">
                    <label htmlFor={`kindroid-ai-id-${participant.id}`}>AI ID</label>
                    <input
                      id={`kindroid-ai-id-${participant.id}`}
                      className="settings-input"
                      type="text"
                      value={participant.aiId}
                      onChange={(event) =>
                        updateParticipant(participant.id, (current) => ({
                          ...current,
                          aiId: event.target.value
                        }))
                      }
                      placeholder="AI ID"
                    />
                  </div>

                  <div className="settings-field">
                    <label htmlFor={`kindroid-output-${participant.id}`}>Output</label>
                    <select
                      id={`kindroid-output-${participant.id}`}
                      className="settings-input"
                      value={participant.ttsProvider}
                      onChange={(event) =>
                        updateParticipant(participant.id, (current) => ({
                          ...current,
                          ttsProvider: event.target.value as KindroidParticipant["ttsProvider"]
                        }))
                      }
                    >
                      <option value="none">Text reply</option>
                      <option value="openai">OpenAI speech</option>
                      <option value="elevenlabs">ElevenLabs speech</option>
                    </select>
                  </div>

                  <div className="settings-field">
                    <label htmlFor={`kindroid-waveform-color-${participant.id}`}>
                      Waveform color
                    </label>
                    <input
                      id={`kindroid-waveform-color-${participant.id}`}
                      className="settings-input settings-color-input"
                      type="color"
                      value={participant.waveformColor}
                      onChange={(event) =>
                        updateParticipant(participant.id, (current) => ({
                          ...current,
                          waveformColor: event.target.value
                        }))
                      }
                    />
                  </div>

                  <div className="settings-field">
                    <label htmlFor={`kindroid-waveform-accent-${participant.id}`}>
                      Waveform accent
                    </label>
                    <select
                      id={`kindroid-waveform-accent-${participant.id}`}
                      className="settings-input"
                      value={participant.waveformAccent}
                      onChange={(event) =>
                        updateParticipant(participant.id, (current) => ({
                          ...current,
                          waveformAccent:
                            event.target.value as KindroidParticipant["waveformAccent"]
                        }))
                      }
                    >
                      {KINDROID_WAVEFORM_ACCENT_OPTIONS.map((accent) => (
                        <option key={accent} value={accent}>
                          {accent}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="settings-field">
                    <label>Narration filter</label>
                    <div className="settings-inline-actions">
                      <button
                        type="button"
                        className={`secondary-button ${participant.filterNarrationForTts ? "active" : ""}`}
                        onClick={() =>
                          updateParticipant(participant.id, (current) => ({
                            ...current,
                            filterNarrationForTts: true
                          }))
                        }
                      >
                        Enabled
                      </button>
                      <button
                        type="button"
                        className={`secondary-button ${!participant.filterNarrationForTts ? "active" : ""}`}
                        onClick={() =>
                          updateParticipant(participant.id, (current) => ({
                            ...current,
                            filterNarrationForTts: false
                          }))
                        }
                      >
                        Disabled
                      </button>
                    </div>
                    <p className="field-status">
                      Strips narration from this Kin’s speech output only. Transcript text stays
                      intact.
                    </p>
                  </div>

                  <div className="settings-field">
                    <label htmlFor={`kindroid-narration-delimiter-${participant.id}`}>
                      Narration delimiter
                    </label>
                    <input
                      id={`kindroid-narration-delimiter-${participant.id}`}
                      className="settings-input"
                      type="text"
                      value={participant.narrationDelimiter}
                      onChange={(event) =>
                        updateParticipant(participant.id, (current) => ({
                          ...current,
                          narrationDelimiter: event.target.value
                        }))
                      }
                      placeholder="*"
                    />
                    <p className="field-status">
                      Single delimiter token used on both sides, for example `*narration*`.
                    </p>
                  </div>

                  <div className="settings-field">
                    <label>Narration FX</label>
                    <div className="settings-inline-actions">
                      <button
                        type="button"
                        className={`secondary-button ${participant.narrationFxEnabled ? "active" : ""}`}
                        onClick={() =>
                          updateParticipant(participant.id, (current) => ({
                            ...current,
                            narrationFxEnabled: true
                          }))
                        }
                      >
                        Enabled
                      </button>
                      <button
                        type="button"
                        className={`secondary-button ${!participant.narrationFxEnabled ? "active" : ""}`}
                        onClick={() =>
                          updateParticipant(participant.id, (current) => ({
                            ...current,
                            narrationFxEnabled: false
                          }))
                        }
                      >
                        Disabled
                      </button>
                    </div>
                    <p className="field-status">
                      Generates at most one subtle ElevenLabs sound effect from concrete audible
                      narration in this Kin&apos;s turn.
                    </p>
                  </div>

                  {participant.ttsProvider === "openai" ? (
                    <>
                      <div className="settings-field">
                        <label htmlFor={`kindroid-openai-voice-${participant.id}`}>
                          OpenAI voice
                        </label>
                        <select
                          id={`kindroid-openai-voice-${participant.id}`}
                          className="settings-input"
                          value={participant.openAiVoice}
                          onChange={(event) =>
                            updateParticipant(participant.id, (current) => ({
                              ...current,
                              openAiVoice: event.target.value
                            }))
                          }
                        >
                          <option value="">Default voice</option>
                          {openAiVoiceOptions.map((voice) => (
                            <option key={voice} value={voice}>
                              {voice}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="settings-field">
                        <label htmlFor={`kindroid-openai-instructions-${participant.id}`}>
                          OpenAI TTS instructions
                        </label>
                        <textarea
                          id={`kindroid-openai-instructions-${participant.id}`}
                          className="settings-input"
                          rows={3}
                          value={participant.openAiInstructions}
                          onChange={(event) =>
                            updateParticipant(participant.id, (current) => ({
                              ...current,
                              openAiInstructions: event.target.value
                            }))
                          }
                          placeholder="Speak with dry patience and measured confidence."
                        />
                      </div>
                    </>
                  ) : null}

                  {participant.ttsProvider === "elevenlabs" ? (
                    <div className="settings-field">
                      <label htmlFor={`kindroid-elevenlabs-voice-${participant.id}`}>
                        ElevenLabs voice ID
                      </label>
                      <input
                        id={`kindroid-elevenlabs-voice-${participant.id}`}
                        className="settings-input"
                        type="text"
                        value={participant.elevenLabsVoiceId}
                        onChange={(event) =>
                          updateParticipant(participant.id, (current) => ({
                            ...current,
                            elevenLabsVoiceId: event.target.value
                          }))
                        }
                        placeholder="Voice ID"
                      />
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="menu-section">
        <div className="menu-section-header">
          <div>
            <p className="eyebrow">Groups</p>
            <h3 className="panel-title">Mirrored group chats</h3>
          </div>
          <button type="button" className="secondary-button" onClick={addGroupMirror}>
            Add Group Mirror
          </button>
        </div>
        <p className="setting-copy">
          Mirror the Kindroid group locally by storing the exact group ID and exact participant
          roster Cadence should expect.
        </p>
        <div className="kindroid-participant-list">
          {groupMirrors.length === 0 ? (
            <article className="setting-card">
              <strong>No mirrored groups yet</strong>
              <p className="setting-copy">
                Create a group in Kindroid first, then mirror its ID and roster here.
              </p>
            </article>
          ) : (
            groupMirrors.map((groupMirror, index) => (
              <article key={groupMirror.id} className="setting-card kindroid-participant-card">
                <div className="kindroid-participant-header">
                  <strong>{groupMirror.displayName.trim() || `Group ${index + 1}`}</strong>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => removeGroupMirror(groupMirror.id)}
                  >
                    Remove
                  </button>
                </div>

                <div className="settings-field">
                  <label htmlFor={`kindroid-group-display-name-${groupMirror.id}`}>
                    Display name
                  </label>
                  <input
                    id={`kindroid-group-display-name-${groupMirror.id}`}
                    className="settings-input"
                    type="text"
                    value={groupMirror.displayName}
                    onChange={(event) =>
                      updateGroupMirror(groupMirror.id, (current) => ({
                        ...current,
                        displayName: event.target.value
                      }))
                    }
                    placeholder="Wizards of the Glass House"
                  />
                </div>

                <div className="settings-field">
                  <label htmlFor={`kindroid-group-id-${groupMirror.id}`}>Group ID</label>
                  <input
                    id={`kindroid-group-id-${groupMirror.id}`}
                    className="settings-input"
                    type="text"
                    value={groupMirror.groupId}
                    onChange={(event) =>
                      updateGroupMirror(groupMirror.id, (current) => ({
                        ...current,
                        groupId: event.target.value
                      }))
                    }
                    placeholder="group ID"
                  />
                </div>

                <div className="settings-field">
                  <label>Turn-taking</label>
                  <div className="settings-inline-actions">
                    <button
                      type="button"
                      className={`secondary-button ${!groupMirror.manualTurnTaking ? "active" : ""}`}
                      onClick={() =>
                        updateGroupMirror(groupMirror.id, (current) => ({
                          ...current,
                          manualTurnTaking: false
                        }))
                      }
                    >
                      Automatic
                    </button>
                    <button
                      type="button"
                      className={`secondary-button ${groupMirror.manualTurnTaking ? "active" : ""}`}
                      onClick={() =>
                        updateGroupMirror(groupMirror.id, (current) => ({
                          ...current,
                          manualTurnTaking: true
                        }))
                      }
                    >
                      Manual
                    </button>
                  </div>
                </div>

                {!groupMirror.manualTurnTaking ? (
                  <div className="settings-grid">
                    <div className="settings-field">
                      <label htmlFor={`kindroid-group-turn-limit-${groupMirror.id}`}>
                        Automatic turn cap
                      </label>
                      <input
                        id={`kindroid-group-turn-limit-${groupMirror.id}`}
                        className="settings-input"
                        type="number"
                        min={1}
                        max={60}
                        value={groupMirror.autoTurnLimit}
                        onChange={(event) =>
                          updateGroupMirror(groupMirror.id, (current) => ({
                            ...current,
                            autoTurnLimit: Number(event.target.value) || 1
                          }))
                        }
                      />
                      <p className="field-status">
                        Safety ceiling for one automatic scene run before control returns to you.
                      </p>
                    </div>

                    <div className="settings-field">
                      <label htmlFor={`kindroid-group-turn-pause-${groupMirror.id}`}>
                        Audio turn pause (ms)
                      </label>
                      <input
                        id={`kindroid-group-turn-pause-${groupMirror.id}`}
                        className="settings-input"
                        type="number"
                        min={0}
                        max={5000}
                        step={50}
                        value={groupMirror.turnPauseMs}
                        onChange={(event) =>
                          updateGroupMirror(groupMirror.id, (current) => ({
                            ...current,
                            turnPauseMs: Number(event.target.value) || 0
                          }))
                        }
                      />
                      <p className="field-status">
                        Gap before the next spoken Kin begins playback. This does not slow
                        Kindroid turn generation.
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="settings-field">
                  <label>Participants</label>
                  <div className="kindroid-group-participant-picks">
                    {participantNames.length === 0 ? (
                      <p className="field-status">
                        Add participants first, then mirror the group membership here.
                      </p>
                    ) : (
                      participantNames.map((participant) => {
                        const selected = groupMirror.participantIds.includes(participant.id);

                        return (
                          <label
                            key={participant.id}
                            className={`kindroid-group-participant-pick ${selected ? "active" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) =>
                                updateGroupMirror(groupMirror.id, (current) => ({
                                  ...current,
                                  participantIds: event.target.checked
                                    ? [...current.participantIds, participant.id]
                                    : current.participantIds.filter((id) => id !== participant.id)
                                }))
                              }
                            />
                            <span>{participant.label}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      </div>
      <div className="settings-toolbar menu-pane-footer">
        <div className="settings-feedback">
          <strong>{settingsSaveState === "error" ? "Save failed" : "Kindroid"}</strong>
          <span>
            {validationMessage ||
              settingsFeedback ||
              "Save the current participant roster and mirrored groups."}
          </span>
        </div>
        <button
          type="button"
          className={`menu-button ${hasUnsavedChanges ? "unsaved" : ""}`}
          disabled={saveDisabled}
          onClick={() => void handleSave()}
        >
          {settingsSaveState === "saving" ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
