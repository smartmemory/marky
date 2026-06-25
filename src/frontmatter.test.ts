import { describe, it, expect } from "vitest";
import { splitFrontmatter, joinFrontmatter, frontmatterKeys } from "./frontmatter";

describe("splitFrontmatter", () => {
  it("splits a standard YAML frontmatter block", () => {
    const text = "---\ntitle: My Post\ndate: 2026-06-25\n---\n# My Post\n\nBody.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBe("title: My Post\ndate: 2026-06-25");
    expect(r.body).toBe("# My Post\n\nBody.");
    expect(r.closeDelim).toBe("---");
  });

  it("returns null fm when there is no frontmatter", () => {
    const text = "# Just a heading\n\nNo metadata.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBeNull();
    expect(r.body).toBe(text);
  });

  it("does not misdetect a body that opens with a thematic break", () => {
    // First line is `---` but there is no closing fence.
    const text = "---\nThis is text under a rule, not metadata.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBeNull();
    expect(r.body).toBe(text);
  });

  it("detects and preserves a `...` closing delimiter", () => {
    const text = "---\na: 1\n...\nBody.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBe("a: 1");
    expect(r.closeDelim).toBe("...");
    expect(r.body).toBe("Body.");
  });

  it("handles an empty frontmatter block", () => {
    const r = splitFrontmatter("---\n---\nBody.");
    expect(r.fm).toBe("");
    expect(r.body).toBe("Body.");
  });

  it("handles an empty body", () => {
    const r = splitFrontmatter("---\ntitle: x\n---\n");
    expect(r.fm).toBe("title: x");
    expect(r.body).toBe("");
  });

  it("splits CRLF input and normalizes inner content to \\n", () => {
    const text = "---\r\ntitle: x\r\ntags: [a, b]\r\n---\r\n# H\r\nBody.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBe("title: x\ntags: [a, b]");
    expect(r.body).toBe("# H\nBody.");
  });

  it("ignores a body `---` thematic break after real frontmatter", () => {
    const text = "---\ntitle: x\n---\n# H\n\n---\n\nMore.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBe("title: x");
    expect(r.body).toBe("# H\n\n---\n\nMore.");
  });

  it("treats a body opening with a thematic break (prose between two rules) as body, not frontmatter", () => {
    const text = "---\n\nIntro prose, not metadata.\n\n---\n\nMore.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBeNull();
    expect(r.body).toBe(text);
  });

  it("rejects a captured block with no top-level keys", () => {
    const text = "---\nJust a sentence with no colon key.\n---\nBody.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBeNull();
    expect(r.body).toBe(text);
  });

  it("still accepts a block that has at least one top-level key", () => {
    const text = "---\n\ntitle: x\n---\nBody.";
    const r = splitFrontmatter(text);
    expect(r.fm).toBe("\ntitle: x");
    expect(r.body).toBe("Body.");
  });
});

describe("joinFrontmatter", () => {
  it("round-trips a split file exactly (block + body)", () => {
    const text = "---\ntitle: My Post\ndate: 2026-06-25\n---\n# My Post\n\nBody.";
    const r = splitFrontmatter(text);
    expect(joinFrontmatter(r.fm, r.body, r.closeDelim)).toBe(text);
  });

  it("round-trips a `...` delimiter", () => {
    const text = "---\na: 1\n...\nBody.";
    const r = splitFrontmatter(text);
    expect(joinFrontmatter(r.fm, r.body, r.closeDelim)).toBe(text);
  });

  it("returns the body unchanged when fm is null", () => {
    expect(joinFrontmatter(null, "# Body")).toBe("# Body");
  });

  it("drops the block when fm is empty or whitespace-only (removal path)", () => {
    expect(joinFrontmatter("", "# Body")).toBe("# Body");
    expect(joinFrontmatter("   \n  ", "# Body")).toBe("# Body");
  });

  it("defaults the closing delimiter to ---", () => {
    expect(joinFrontmatter("a: 1", "B")).toBe("---\na: 1\n---\nB");
  });
});

describe("frontmatterKeys", () => {
  it("returns only top-level keys, skipping nested, indented, and comment lines", () => {
    const fm = "title: My Post\ndate: 2026-06-25\ntags:\n  - a\n  - b\n# a comment\nmeta:\n  nested: v";
    expect(frontmatterKeys(fm)).toEqual(["title", "date", "tags", "meta"]);
  });

  it("returns an empty array for empty frontmatter", () => {
    expect(frontmatterKeys("")).toEqual([]);
  });
});
