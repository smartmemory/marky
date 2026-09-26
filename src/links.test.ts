import { describe, it, expect } from "vitest";
import { classifyLink, slugify, isOpenableFile } from "./links";

describe("classifyLink", () => {
  const cases: Array<[string, string | null, ReturnType<typeof classifyLink>]> = [
    ["http://example.com/page", null, { kind: "external", url: "http://example.com/page" }],
    ["https://example.com/page", null, { kind: "external", url: "https://example.com/page" }],
    ["mailto:someone@example.com", null, { kind: "external", url: "mailto:someone@example.com" }],
    ["#anchor", null, { kind: "anchor", fragment: "anchor" }],
    ["#Encoded%20Anchor", null, { kind: "anchor", fragment: "Encoded Anchor" }],
    [
      "./other.md",
      "/Users/me/docs/readme.md",
      { kind: "file", path: "/Users/me/docs/other.md", fragment: undefined },
    ],
    [
      "../dir/x.md#sec",
      "/Users/me/docs/sub/readme.md",
      { kind: "file", path: "/Users/me/docs/dir/x.md", fragment: "sec" },
    ],
    ["/abs/path.md", null, { kind: "file", path: "/abs/path.md", fragment: undefined }],
    [
      "file:///abs/x.md",
      null,
      { kind: "file", path: "/abs/x.md", fragment: undefined },
    ],
    ["other.md", null, { kind: "unsupported" }],
    ["javascript:alert(1)", "/Users/me/docs/readme.md", { kind: "unsupported" }],
    ["", "/Users/me/docs/readme.md", { kind: "unsupported" }],
  ];

  for (const [href, currentDocPath, expected] of cases) {
    it(`classifies ${JSON.stringify(href)} (doc: ${currentDocPath ?? "none"})`, () => {
      expect(classifyLink(href, currentDocPath)).toEqual(expected);
    });
  }
});

describe("isOpenableFile", () => {
  it("accepts markdown and plain-text extensions", () => {
    expect(isOpenableFile("/x/y.md")).toBe(true);
    expect(isOpenableFile("/x/y.markdown")).toBe(true);
    expect(isOpenableFile("/x/y.txt")).toBe(true);
    expect(isOpenableFile("/x/y.MD")).toBe(true);
  });

  it("rejects other extensions and extension-less paths", () => {
    expect(isOpenableFile("/x/y.pdf")).toBe(false);
    expect(isOpenableFile("/x/y")).toBe(false);
  });
});

describe("slugify", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("drops punctuation but keeps hyphens and underscores", () => {
    expect(slugify("Hello, World! (again)")).toBe("hello-world-again");
    expect(slugify("snake_case-heading")).toBe("snake_case-heading");
  });

  it("keeps unicode letters", () => {
    expect(slugify("Café☕ résumé")).toBe("café-résumé");
  });

  it("collapses multiple spaces into one hyphen", () => {
    expect(slugify("Multiple   spaces  here")).toBe("multiple-spaces-here");
  });

  it("trims leading and trailing whitespace", () => {
    expect(slugify("  Leading and trailing  ")).toBe("leading-and-trailing");
  });
});
