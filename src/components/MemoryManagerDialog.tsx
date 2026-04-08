import { useCallback, useEffect, useMemo, useState } from "react";
import type { MemoryStoredItem, MemoryStoredSession } from "../shared/memory-control";

type MemoryManagerDialogProps = {
  onClose: () => void;
  onDeleteAll: () => Promise<number>;
  onDeleteSelected: (ids: string[]) => Promise<number>;
  onDeleteAllSessions: () => Promise<number>;
  onDeleteSelectedSessions: (conversationIds: string[]) => Promise<number>;
  onRefresh: () => Promise<{
    items: MemoryStoredItem[];
    sessions: MemoryStoredSession[];
  }>;
};

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export function MemoryManagerDialog({
  onClose,
  onDeleteAll,
  onDeleteSelected,
  onDeleteAllSessions,
  onDeleteSelectedSessions,
  onRefresh
}: MemoryManagerDialogProps) {
  const [items, setItems] = useState<MemoryStoredItem[]>([]);
  const [sessions, setSessions] = useState<MemoryStoredSession[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");

  const loadItems = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const nextState = await onRefresh();
      setItems(nextState.items);
      setSessions(nextState.sessions);
      setSelectedIds((previous) =>
        previous.filter((id) => nextState.items.some((item) => item.id === id))
      );
      setSelectedSessionIds((previous) =>
        previous.filter((id) =>
          nextState.sessions.some((session) => session.conversationId === id)
        )
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to load memories.");
    } finally {
      setLoading(false);
    }
  }, [onRefresh]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const allSelected = useMemo(
    () => items.length > 0 && selectedIds.length === items.length,
    [items.length, selectedIds.length]
  );
  const allSessionsSelected = useMemo(
    () => sessions.length > 0 && selectedSessionIds.length === sessions.length,
    [selectedSessionIds.length, sessions.length]
  );

  function toggleSelection(id: string): void {
    setSelectedIds((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id]
    );
  }

  function toggleSessionSelection(conversationId: string): void {
    setSelectedSessionIds((previous) =>
      previous.includes(conversationId)
        ? previous.filter((entry) => entry !== conversationId)
        : [...previous, conversationId]
    );
  }

  async function handleDeleteSelected(): Promise<void> {
    if (selectedIds.length === 0) {
      return;
    }

    setPending(true);
    try {
      const deleted = await onDeleteSelected(selectedIds);
      setFeedback(`Deleted ${deleted} memor${deleted === 1 ? "y" : "ies"}.`);
      await loadItems();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Failed to delete selected memories."
      );
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteAll(): Promise<void> {
    if (items.length === 0) {
      return;
    }

    setPending(true);
    try {
      const deleted = await onDeleteAll();
      setFeedback(`Deleted ${deleted} memor${deleted === 1 ? "y" : "ies"}.`);
      setSelectedIds([]);
      await loadItems();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to delete all memories.");
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteSelectedSessions(): Promise<void> {
    if (selectedSessionIds.length === 0) {
      return;
    }

    setPending(true);
    try {
      const deleted = await onDeleteSelectedSessions(selectedSessionIds);
      setFeedback(`Deleted ${deleted} session${deleted === 1 ? "" : "s"}.`);
      await loadItems();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Failed to delete selected sessions."
      );
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteAllSessions(): Promise<void> {
    if (sessions.length === 0) {
      return;
    }

    setPending(true);
    try {
      const deleted = await onDeleteAllSessions();
      setFeedback(`Deleted ${deleted} session${deleted === 1 ? "" : "s"}.`);
      setSelectedSessionIds([]);
      await loadItems();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to delete all sessions.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="window-backdrop" onClick={onClose} role="presentation">
      <section
        className="panel menu-window"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Memory manager"
      >
        <header className="menu-window-header">
          <div>
            <p className="eyebrow">Memory</p>
            <h2 className="panel-title">Stored memories</h2>
          </div>
          <button type="button" className="menu-close" onClick={onClose} disabled={pending}>
            Close
          </button>
        </header>

        <div className="menu-window-body">
          <div className="menu-stack">
            <div className="settings-inline-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={loading || pending}
                onClick={() => void loadItems()}
              >
                Refresh
              </button>
            </div>

            {feedback ? (
              <article className="setting-card">
                <strong>Memory manager</strong>
                <p className="setting-copy">{feedback}</p>
              </article>
            ) : null}

            {loading ? (
              <article className="setting-card">
                <strong>Loading memories...</strong>
              </article>
            ) : (
              <>
                <section className="menu-section">
                  <div className="menu-section-header">
                    <div>
                      <p className="eyebrow">Durable</p>
                      <h3 className="panel-title">Stored memories</h3>
                    </div>
                    <div className="settings-inline-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={pending || items.length === 0}
                        onClick={() =>
                          setSelectedIds(allSelected ? [] : items.map((item) => item.id))
                        }
                      >
                        {allSelected ? "Clear Selection" : "Select All"}
                      </button>
                    </div>
                  </div>

                  {items.length === 0 ? (
                    <article className="setting-card">
                      <strong>No stored memories</strong>
                      <p className="setting-copy">
                        The sidecar has not stored any durable memories for this profile yet.
                      </p>
                    </article>
                  ) : (
                    <div className="memory-list">
                      {items.map((item) => (
                        <label key={item.id} className="memory-item">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelection(item.id)}
                            disabled={pending}
                          />
                          <div className="memory-item-body">
                            <div className="memory-item-header">
                              <strong>{item.type}</strong>
                              <span className="field-status">
                                updated {formatTimestamp(item.updatedAt)}
                              </span>
                            </div>
                            <p className="setting-copy">{item.text}</p>
                            <p className="field-status">
                              keywords: {item.keywords.join(", ") || "none"} | seen{" "}
                              {item.sourceCount} time{item.sourceCount === 1 ? "" : "s"}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="settings-toolbar memory-section-toolbar">
                    <div className="settings-feedback">
                      <strong>Memory selection</strong>
                      <span>
                        {selectedIds.length === 0
                          ? "No memories selected."
                          : `${selectedIds.length} selected.`}
                      </span>
                    </div>
                    <div className="settings-inline-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={pending || selectedIds.length === 0}
                        onClick={() => void handleDeleteSelected()}
                      >
                        {pending ? "Deleting..." : "Delete Selected"}
                      </button>
                      <button
                        type="button"
                        className="menu-button"
                        disabled={pending || items.length === 0}
                        onClick={() => void handleDeleteAll()}
                      >
                        {pending ? "Deleting..." : "Delete All"}
                      </button>
                    </div>
                  </div>
                </section>

                <section className="menu-section">
                  <div className="menu-section-header">
                    <div>
                      <p className="eyebrow">Active</p>
                      <h3 className="panel-title">Stored sessions</h3>
                    </div>
                    <div className="settings-inline-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={pending || sessions.length === 0}
                        onClick={() =>
                          setSelectedSessionIds(
                            allSessionsSelected
                              ? []
                              : sessions.map((session) => session.conversationId)
                          )
                        }
                      >
                        {allSessionsSelected ? "Clear Selection" : "Select All"}
                      </button>
                    </div>
                  </div>

                  {sessions.length === 0 ? (
                    <article className="setting-card">
                      <strong>No active sessions</strong>
                      <p className="setting-copy">
                        No open session buffers are currently stored for this profile.
                      </p>
                    </article>
                  ) : (
                    <div className="memory-list">
                      {sessions.map((session) => {
                        const lastUserTurn = [...session.recentTurns]
                          .reverse()
                          .find((turn) => turn.role === "user");

                        return (
                          <label key={session.conversationId} className="memory-item">
                            <input
                              type="checkbox"
                              checked={selectedSessionIds.includes(session.conversationId)}
                              onChange={() => toggleSessionSelection(session.conversationId)}
                              disabled={pending}
                            />
                            <div className="memory-item-body">
                              <div className="memory-item-header">
                                <strong>{session.backend}</strong>
                                <span className="field-status">
                                  updated {formatTimestamp(session.updatedAt)}
                                </span>
                              </div>
                              <p className="setting-copy">
                                {lastUserTurn?.text || "No recent user text captured."}
                              </p>
                              <p className="field-status">
                                conversation {session.conversationId} | turns{" "}
                                {session.recentTurns.length}
                                {session.participantIds.length > 0
                                  ? ` | participants ${session.participantIds.join(", ")}`
                                  : ""}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <div className="settings-toolbar memory-section-toolbar">
                    <div className="settings-feedback">
                      <strong>Session selection</strong>
                      <span>
                        {selectedSessionIds.length === 0
                          ? "No sessions selected."
                          : `${selectedSessionIds.length} selected.`}
                      </span>
                    </div>
                    <div className="settings-inline-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={pending || selectedSessionIds.length === 0}
                        onClick={() => void handleDeleteSelectedSessions()}
                      >
                        {pending ? "Deleting..." : "Delete Selected"}
                      </button>
                      <button
                        type="button"
                        className="menu-button"
                        disabled={pending || sessions.length === 0}
                        onClick={() => void handleDeleteAllSessions()}
                      >
                        {pending ? "Deleting..." : "Delete All"}
                      </button>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
