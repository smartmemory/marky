export type FrontmatterSplit = {
  /** Verbatim inner YAML between the fences, or null when there is no frontmatter. */
  fm: string | null;
  /** Everything after the closing fence line. Fed to Milkdown. */
  body: string;
  /** The closing delimiter that was used, so it can be preserved on join. */
  closeDelim: "---" | "...";
};

// The first line must be exactly `---` (optional trailing spaces/tabs), then a newline.
const OPEN_RE = /^---[ \t]*\r?\n/;
// A top-level key: an unindented `name:` line.
const KEY_RE = /^([A-Za-z0-9_][A-Za-z0-9_-]*)\s*:/;

const stripCr = (line: string): string => line.replace(/\r$/, "");

export function splitFrontmatter(text: string): FrontmatterSplit {
  const open = OPEN_RE.exec(text);
  if (!open) {
    return { fm: null, body: text, closeDelim: "---" };
  }
  const lines = text.slice(open[0].length).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = stripCr(lines[i]);
    if (line === "---" || line === "...") {
      const fm = lines.slice(0, i).map(stripCr).join("\n");
      // Guard against a body that merely opens with a thematic break: a real
      // frontmatter block is either empty or has at least one top-level key.
      // Prose between two `---` rules has neither, so treat it as body.
      if (fm.trim() !== "" && frontmatterKeys(fm).length === 0) {
        return { fm: null, body: text, closeDelim: "---" };
      }
      const body = lines.slice(i + 1).map(stripCr).join("\n");
      return { fm, body, closeDelim: line };
    }
  }
  // No closing fence: the leading `---` is a thematic break, not frontmatter.
  return { fm: null, body: text, closeDelim: "---" };
}

export function joinFrontmatter(
  fm: string | null,
  body: string,
  closeDelim: "---" | "..." = "---",
): string {
  if (fm === null || fm.trim() === "") {
    return body;
  }
  return `---\n${fm}\n${closeDelim}\n${body}`;
}

export function frontmatterKeys(fm: string): string[] {
  const keys: string[] = [];
  for (const raw of fm.split("\n")) {
    const line = stripCr(raw);
    if (/^\s/.test(line) || line.startsWith("#")) continue;
    const m = KEY_RE.exec(line);
    if (m) keys.push(m[1]);
  }
  return keys;
}
