import { useState } from "react";
import { frontmatterKeys } from "./frontmatter";

type Props = {
  value: string;
  onChange: (next: string) => void;
  onRemove: () => void;
};

export function FrontmatterPanel({ value, onChange, onRemove }: Props) {
  // A freshly inserted (empty) block starts open for typing; loaded files start collapsed.
  const [open, setOpen] = useState(value.trim() === "");

  const keys = frontmatterKeys(value);
  const summary =
    keys.length > 0
      ? keys.slice(0, 5).join(", ") + (keys.length > 5 ? "…" : "")
      : "empty";

  const toggle = () => setOpen((o) => !o);

  return (
    <div className="marky-frontmatter">
      <div
        className="marky-frontmatter-header"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <span className="marky-frontmatter-disclosure">{open ? "▾" : "▸"}</span>
        <span className="marky-frontmatter-title">frontmatter</span>
        {!open && <span className="marky-frontmatter-keys">({summary})</span>}
        <button
          type="button"
          className="marky-frontmatter-remove"
          title="Remove frontmatter"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ✕
        </button>
      </div>
      {open && (
        <div className="marky-frontmatter-body">
          <textarea
            className="marky-frontmatter-textarea"
            value={value}
            spellCheck={false}
            placeholder="key: value"
            rows={Math.max(3, value.split("\n").length)}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
