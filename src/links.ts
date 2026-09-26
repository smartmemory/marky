/**
 * Pure classification and resolution helpers for following links in the
 * editor (Cmd+click). No I/O here — Editor/App decide what to do with the
 * result. Path resolution is hand-rolled (no Node `path`) since this runs in
 * the webview.
 */

export type LinkTarget =
  | { kind: "external"; url: string }
  | { kind: "anchor"; fragment: string }
  | { kind: "file"; path: string; fragment?: string }
  | { kind: "unsupported" };

const EXTERNAL_SCHEMES = new Set(["http", "https", "mailto"]);

/** Extensions Marky will actually open when a local file link is followed. */
const OPENABLE_EXTENSIONS = new Set(["md", "markdown", "txt"]);

// Matches a leading URI scheme like "https:" or "mailto:". A single-letter
// "scheme" immediately followed by a slash is a Windows drive letter
// (`C:\`, `C:/`), not a real scheme, and is excluded below.
const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

function schemeOf(href: string): string | null {
  const m = SCHEME_RE.exec(href);
  if (!m) return null;
  const scheme = m[1];
  if (scheme.length === 1 && /^[\\/]/.test(href.slice(m[0].length))) return null;
  return scheme.toLowerCase();
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function splitFragment(s: string): { base: string; fragment?: string } {
  const i = s.indexOf("#");
  if (i === -1) return { base: s };
  return { base: s.slice(0, i), fragment: decode(s.slice(i + 1)) };
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p);
}

function dirname(p: string): string {
  const norm = normalizeSlashes(p);
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(0, i) : "";
}

/** Resolve a relative path against a base directory, handling `.`/`..` segments. */
function resolveRelative(baseDir: string, relative: string): string {
  const base = normalizeSlashes(baseDir);
  const drive = /^[a-zA-Z]:/.exec(base)?.[0] ?? "";
  const unixAbsolute = base.startsWith("/");
  const stack = base.slice(drive.length).split("/").filter(Boolean);

  for (const seg of normalizeSlashes(relative).split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (stack.length) stack.pop();
      continue;
    }
    stack.push(seg);
  }
  const joined = stack.join("/");
  if (drive) return `${drive}/${joined}`;
  return unixAbsolute ? `/${joined}` : joined;
}

/** Does this local path have an extension Marky will open? */
export function isOpenableFile(path: string): boolean {
  const i = path.lastIndexOf(".");
  if (i === -1) return false;
  return OPENABLE_EXTENSIONS.has(path.slice(i + 1).toLowerCase());
}

/**
 * Classify an `<a href>` from the editor into what following it should do.
 * `currentDocPath` is the open document's path (null for an unsaved doc) and
 * is only needed to resolve a relative file link.
 */
export function classifyLink(href: string, currentDocPath: string | null): LinkTarget {
  const trimmed = href.trim();
  if (!trimmed) return { kind: "unsupported" };

  if (trimmed.startsWith("#")) {
    return { kind: "anchor", fragment: decode(trimmed.slice(1)) };
  }

  const scheme = schemeOf(trimmed);
  if (scheme && EXTERNAL_SCHEMES.has(scheme)) {
    return { kind: "external", url: trimmed };
  }

  if (scheme === "file") {
    const { base, fragment } = splitFragment(trimmed.slice("file:".length));
    // "file://<path>" — the authority's two slashes are the path's own root.
    const rawPath = base.startsWith("//") ? base.slice(2) : base;
    return { kind: "file", path: decode(rawPath), fragment };
  }

  if (scheme) return { kind: "unsupported" }; // javascript:, ftp:, tel:, ...

  const { base, fragment } = splitFragment(trimmed);
  const path = decode(base);
  if (isAbsolutePath(path)) return { kind: "file", path, fragment };

  if (!currentDocPath) return { kind: "unsupported" };
  return { kind: "file", path: resolveRelative(dirname(currentDocPath), path), fragment };
}

/**
 * GitHub-style heading slug: lowercase, drop punctuation (unicode letters,
 * digits, `_` and `-` survive), collapse whitespace to a single `-`.
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}
