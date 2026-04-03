import type { ReactNode } from "react";

type MenuWindowProps = {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
};

export function MenuWindow({ title, subtitle, onClose, children }: MenuWindowProps) {
  return (
    <div className="window-backdrop" onClick={onClose} role="presentation">
      <section
        className="panel menu-window"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="menu-window-header">
          <div>
            <p className="eyebrow">{title}</p>
            <h2 className="panel-title">{subtitle}</h2>
          </div>
          <button type="button" className="menu-close" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="menu-window-body">{children}</div>
      </section>
    </div>
  );
}
