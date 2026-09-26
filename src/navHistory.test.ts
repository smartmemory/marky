import { describe, it, expect } from "vitest";
import { NavHistory } from "./navHistory";

function historyOf(...paths: string[]): NavHistory {
  const history = new NavHistory();
  paths.forEach((path, i) => history.push({ path, scrollTop: i * 100 }));
  return history;
}

describe("NavHistory", () => {
  it("round-trips paths and scroll offsets with boundary checks", () => {
    const h = historyOf("a", "b", "c");
    expect(h.canForward).toBe(false);
    expect(h.forward()).toBeNull();
    expect(h.back()).toEqual({ path: "b", scrollTop: 100 });
    expect(h.back()).toEqual({ path: "a", scrollTop: 0 });
    expect(h.canBack).toBe(false);
    expect(h.back()).toBeNull();
    expect(h.forward()).toEqual({ path: "b", scrollTop: 100 });
    expect(h.forward()).toEqual({ path: "c", scrollTop: 200 });
  });

  for (const path of ["b", "d"]) {
    it(`truncates forward entries when pushing ${path} after back`, () => {
      const h = historyOf("a", "b", "c");
      h.back();
      h.push({ path, scrollTop: 42 });
      expect(h.length).toBe(path === "b" ? 2 : 3);
      expect(h.current).toEqual({ path, scrollTop: 42 });
      expect(h.canForward).toBe(false);
    });
  }

  it("suppresses adjacent duplicates but permits revisiting older paths", () => {
    const h = historyOf("a", "a", "b", "a");
    expect(h.length).toBe(3);
    expect(h.back()?.path).toBe("b");
    expect(h.back()).toEqual({ path: "a", scrollTop: 100 });
  });

  it("caps history at 100, dropping the oldest entries", () => {
    const h = historyOf(...Array.from({ length: 105 }, (_, i) => String(i)));
    expect(h.length).toBe(100);
    for (let i = 103; i >= 5; i--) expect(h.back()?.path).toBe(String(i));
    expect(h.back()).toBeNull();
    expect(h.current?.path).toBe("5");
  });

  const removals: Array<[string[], number, string, string | null, boolean, boolean]> = [
    [["a", "b", "c"], 1, "b", "a", false, true],
    [["a", "b", "c"], 1, "a", "b", false, true],
    [["a", "b", "c"], 1, "c", "b", true, false],
    [["a", "b", "c"], 2, "a", "b", false, true],
    [["a", "b", "c"], 0, "c", "b", true, false],
    [["a", "b", "a"], 0, "a", "b", false, false],
    [["a"], 0, "a", null, false, false],
    [["a"], 0, "absent", "a", false, false],
    [[], 0, "a", null, false, false],
  ];
  for (const [paths, backs, removed, current, canBack, canForward] of removals) {
    it(`removes all ${removed} from ${paths} after ${backs} back steps`, () => {
      const h = historyOf(...paths);
      for (let i = 0; i < backs; i++) h.back();
      h.remove(removed);
      expect(h.length).toBe(paths.filter((path) => path !== removed).length);
      expect(h.current?.path ?? null).toBe(current);
      expect(h.canBack).toBe(canBack);
      expect(h.canForward).toBe(canForward);
    });
  }

  it("updates scroll and Save As path without changing the stacks", () => {
    const h = historyOf("a", "b", "c");
    h.back();
    h.updateCurrent({ scrollTop: 456 });
    h.updateCurrent({ path: "renamed" });
    expect(h.current).toEqual({ path: "renamed", scrollTop: 456 });
    expect(h.length).toBe(3);
    expect(h.forward()?.path).toBe("c");
    expect(h.back()?.path).toBe("renamed");
  });

  it("isolates entries and cloned traversal until committed", () => {
    const h = historyOf("a", "b");
    const copy = h.clone();
    copy.back();
    copy.updateCurrent({ path: "changed" });
    const entry = h.current!;
    entry.path = "mutated";
    expect(h.current?.path).toBe("b");
    expect(h.back()?.path).toBe("a");
  });

  it("clears and can be seeded again", () => {
    const h = historyOf("a", "b");
    h.clear();
    h.updateCurrent({ path: "ignored" });
    expect(h.length).toBe(0);
    expect(h.current).toBeNull();
    expect(h.back()).toBeNull();
    expect(h.forward()).toBeNull();
    h.push({ path: "new", scrollTop: 0 });
    expect(h.current?.path).toBe("new");
  });
});
