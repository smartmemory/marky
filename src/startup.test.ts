import { describe, it, expect } from "vitest";
import { pickStartupFile } from "./startup";

describe("pickStartupFile", () => {
  it("prefers the pending OS file over the last document", () => {
    expect(pickStartupFile("/pending.md", true, "/last.md")).toEqual({
      path: "/pending.md",
      source: "pending",
    });
  });

  it("opens the pending OS file even when reopening is disabled", () => {
    expect(pickStartupFile("/pending.md", false, "/last.md")).toEqual({
      path: "/pending.md",
      source: "pending",
    });
  });

  it("returns null when reopening is disabled and there is no pending file", () => {
    expect(pickStartupFile(null, false, "/last.md")).toBeNull();
  });

  it("reopens the last document when enabled and there is no pending file", () => {
    expect(pickStartupFile(null, true, "/last.md")).toEqual({
      path: "/last.md",
      source: "last",
    });
  });

  it("returns null when there is no document to open", () => {
    expect(pickStartupFile(null, true, null)).toBeNull();
    expect(pickStartupFile(null, false, null)).toBeNull();
  });
});
