import { useEffect, useMemo, useState } from "react";
import type { MemoryStoredItem } from "../shared/memory-control";

type MemoryManagerDialogProps = {
  onClose: () => void;
  onDeleteAll: () => Promise<number>;
  onDeleteSelected: (ids: string[]) => Promise<number>;
  onRefresh: () => Promise<MemoryStoredItem[]>;
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
  onRefresh
}: MemoryManagerDialogProps) {
  const [items, setItems] = useState<MemoryStoredItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function loadItems(): Promise<void> {
    setLoading(true);
    try {
      const nextItems = await onRefresh();
      setItems(nextItems);
      setSelectedIds((previous) =>
        previous.filter((id) => nextItems.some((item) => item.id === id))
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to load memories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  const allSelected = useMemo(
    () => items.length > 0 && selectedIds.length === items.length,
    [items.length, selectedIds.length]
  );

  function toggleSelection(id: string): void {
    setSelectedIds((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id]
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
                disabled={loading || pending || items.length === 0}
                onClick={() =>
                  setSelectedIds(allSelected ? [] : items.map((item) => item.id))
                }
              >
                {allSelected ? "Clear Selection" : "Select All"}
              </button>
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
            ) : items.length === 0 ? (
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
                        keywords: {item.keywords.join(", ") || "none"} | seen {item.sourceCount} time
                        {item.sourceCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="settings-toolbar">
          <div className="settings-feedback">
            <strong>Selection</strong>
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
    </div>
  );
}
