type ChatBreakDialogProps = {
  error: string;
  greeting: string;
  pending: boolean;
  onChangeGreeting: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function ChatBreakDialog({
  error,
  greeting,
  pending,
  onChangeGreeting,
  onClose,
  onConfirm
}: ChatBreakDialogProps) {
  const canConfirm = greeting.trim().length > 0 && !pending;

  return (
    <div className="window-backdrop" onClick={onClose} role="presentation">
      <section
        className="panel chat-break-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Chat Break"
      >
        <header className="menu-window-header">
          <div>
            <p className="eyebrow">Chat Break</p>
            <h2 className="panel-title">Start a fresh Kindroid conversation</h2>
          </div>
          <button type="button" className="menu-close" onClick={onClose} disabled={pending}>
            Close
          </button>
        </header>

        <div className="menu-stack">
          <div className="settings-field">
            <label htmlFor="chat-break-greeting">Greeting</label>
            <textarea
              id="chat-break-greeting"
              className="compose-input chat-break-input"
              rows={4}
              value={greeting}
              onChange={(event) => onChangeGreeting(event.target.value)}
              placeholder="Hello."
              autoFocus
            />
            <p className="field-status">
              Kindroid uses this as the first assistant message after the break.
            </p>
          </div>

          {error ? (
            <article className="setting-card">
              <strong>Chat break failed</strong>
              <p className="setting-copy">{error}</p>
            </article>
          ) : null}
        </div>

        <div className="settings-toolbar chat-break-toolbar">
          <div className="settings-feedback">
            <strong>Kindroid reset</strong>
            <span>The current short-term conversation will be replaced with this greeting.</span>
          </div>
          <div className="settings-inline-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button
              type="button"
              className="menu-button"
              disabled={!canConfirm}
              onClick={onConfirm}
            >
              {pending ? "Running..." : "Run Chat Break"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
