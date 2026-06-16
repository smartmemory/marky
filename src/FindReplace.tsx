import { useEffect, useRef } from "react";

type Mode = "find" | "replace";

type Props = {
  mode: Mode;
  query: string;
  replacement: string;
  caseSensitive: boolean;
  matchInfo: { current: number; total: number };
  onQueryChange: (q: string) => void;
  onReplacementChange: (r: string) => void;
  onToggleCase: () => void;
  onNext: () => void;
  onPrev: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
};

export function FindReplace(props: Props) {
  const { mode, query, replacement, caseSensitive, matchInfo } = props;
  const findRef = useRef<HTMLInputElement>(null);

  // Focus the find field whenever the bar opens.
  useEffect(() => {
    findRef.current?.focus();
    findRef.current?.select();
  }, []);

  const count =
    matchInfo.total > 0
      ? `${matchInfo.current + 1}/${matchInfo.total}`
      : query
        ? "No results"
        : "";

  const onFindKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) props.onPrev();
      else props.onNext();
    } else if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    }
  };

  const onReplaceKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      props.onReplace();
    } else if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    }
  };

  return (
    <div className="marky-find" role="search">
      <div className="marky-find-row">
        <input
          ref={findRef}
          className="marky-find-input"
          type="text"
          placeholder="Find"
          value={query}
          onChange={(e) => props.onQueryChange(e.target.value)}
          onKeyDown={onFindKey}
        />
        <span className="marky-find-count">{count}</span>
        <button
          type="button"
          className={`marky-find-btn${caseSensitive ? " is-active" : ""}`}
          title="Match case"
          aria-pressed={caseSensitive}
          onClick={props.onToggleCase}
        >
          Aa
        </button>
        <button
          type="button"
          className="marky-find-btn"
          title="Previous match (Shift+Enter)"
          onClick={props.onPrev}
          disabled={!matchInfo.total}
        >
          ↑
        </button>
        <button
          type="button"
          className="marky-find-btn"
          title="Next match (Enter)"
          onClick={props.onNext}
          disabled={!matchInfo.total}
        >
          ↓
        </button>
        <button
          type="button"
          className="marky-find-btn"
          title="Close (Esc)"
          onClick={props.onClose}
        >
          ✕
        </button>
      </div>
      {mode === "replace" && (
        <div className="marky-find-row">
          <input
            className="marky-find-input"
            type="text"
            placeholder="Replace"
            value={replacement}
            onChange={(e) => props.onReplacementChange(e.target.value)}
            onKeyDown={onReplaceKey}
          />
          <button
            type="button"
            className="marky-find-btn marky-find-text"
            title="Replace (Enter)"
            onClick={props.onReplace}
            disabled={!matchInfo.total}
          >
            Replace
          </button>
          <button
            type="button"
            className="marky-find-btn marky-find-text"
            title="Replace all"
            onClick={props.onReplaceAll}
            disabled={!matchInfo.total}
          >
            All
          </button>
        </div>
      )}
    </div>
  );
}
