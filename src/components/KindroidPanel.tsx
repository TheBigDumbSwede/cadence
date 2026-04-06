import { useEffect, useMemo, useState } from "react";
import type { SettingsSnapshot } from "../shared/app-settings";
import type { KindroidParticipant } from "../shared/kindroid-participants";

type KindroidPanelProps = {
  settingsLoaded: boolean;
  settingsSaveState: "idle" | "saving" | "saved" | "error";
  settingsFeedback: string;
  settingsSnapshot: SettingsSnapshot | null;
  onSaveParticipants: (update: {
    kindroidParticipants: KindroidParticipant[];
    activeKindroidParticipantId: string | null;
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

function createParticipant(defaultTtsProvider: KindroidParticipant["ttsProvider"]): KindroidParticipant {
  return {
    id: crypto.randomUUID(),
    aiId: "",
    displayName: "",
    bubbleName: "",
    ttsProvider: defaultTtsProvider,
    openAiVoice: "",
    openAiInstructions: "",
    elevenLabsVoiceId: ""
  };
}

export function KindroidPanel({
  settingsLoaded,
  settingsSaveState,
  settingsFeedback,
  settingsSnapshot,
  onSaveParticipants
}: KindroidPanelProps) {
  const [participants, setParticipants] = useState<KindroidParticipant[]>([]);
  const [activeKindroidParticipantId, setActiveKindroidParticipantId] = useState<string | null>(
    null
  );
  const [validationMessage, setValidationMessage] = useState("");

  useEffect(() => {
    if (!settingsSnapshot) {
      return;
    }

    setParticipants(settingsSnapshot.kindroidParticipants);
    setActiveKindroidParticipantId(settingsSnapshot.activeKindroidParticipantId);
    setValidationMessage("");
  }, [settingsSnapshot]);

  const saveDisabled = !settingsLoaded || settingsSaveState === "saving";
  const defaultTtsProvider = settingsSnapshot?.preferences.ttsProvider ?? "none";
  const activeParticipantValue = activeKindroidParticipantId ?? "";
  const participantNames = useMemo(
    () =>
      participants.map((participant, index) => ({
        id: participant.id,
        label: participant.displayName.trim() || `Participant ${index + 1}`
      })),
    [participants]
  );

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
    const nextParticipant = createParticipant(defaultTtsProvider);
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
        currentActiveId === participantId
          ? nextParticipants[0]?.id ?? null
          : currentActiveId
      );

      return nextParticipants;
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

    setValidationMessage("");

    const nextActiveParticipantId =
      participants.length === 0
        ? null
        : participants.some((participant) => participant.id === activeKindroidParticipantId)
          ? activeKindroidParticipantId
          : participants[0].id;

    await onSaveParticipants({
      kindroidParticipants: participants,
      activeKindroidParticipantId: nextActiveParticipantId
    });
  }

  return (
    <div className="menu-stack">
      <section className="menu-section">
        <div className="menu-section-header">
          <div>
            <p className="eyebrow">Kindroid</p>
            <h3 className="panel-title">Participants</h3>
          </div>
          <button type="button" className="secondary-button" onClick={addParticipant}>
            Add Participant
          </button>
        </div>
        <p className="setting-copy">
          Configure the active Kindroid roster here. Solo chat is just the one-participant case;
          future group routing will reuse the same entries.
        </p>
        <div className="settings-field">
          <label htmlFor="active-kindroid-participant">Active Kindroid</label>
          <select
            id="active-kindroid-participant"
            className="settings-input"
            value={activeParticipantValue}
            onChange={(event) =>
              setActiveKindroidParticipantId(event.target.value || null)
            }
          >
            <option value="">No active participant</option>
            {participantNames.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.label}
              </option>
            ))}
          </select>
          <p className="field-status">
            This participant drives the current Kindroid solo conversation and bubble naming.
          </p>
        </div>
      </section>

      <section className="menu-section">
        <div className="kindroid-participant-list">
          {participants.length === 0 ? (
            <article className="setting-card">
              <strong>No participants yet</strong>
              <p className="setting-copy">
                Add one or more Kindroids here, then select the active one by name.
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
        <div className="settings-toolbar">
          <div className="settings-feedback">
            <strong>{settingsSaveState === "error" ? "Save failed" : "Kindroid"}</strong>
            <span>{validationMessage || settingsFeedback || "Save the current participant roster."}</span>
          </div>
          <button
            type="button"
            className="menu-button"
            disabled={saveDisabled}
            onClick={() => void handleSave()}
          >
            {settingsSaveState === "saving" ? "Saving..." : "Save Kindroid"}
          </button>
        </div>
      </section>
    </div>
  );
}
