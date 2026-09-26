export type NavEntry = { path: string; scrollTop: number };

/** In-memory document history. Returned entries are copies, not mutable storage. */
export class NavHistory {
  private entries: NavEntry[] = [];
  private cursor = -1;

  get length(): number { return this.entries.length; }
  get current(): NavEntry | null { return this.entryAt(this.cursor); }
  get canBack(): boolean { return this.cursor > 0; }
  get canForward(): boolean { return this.cursor < this.entries.length - 1; }

  private entryAt(index: number): NavEntry | null {
    const entry = this.entries[index];
    return entry ? { ...entry } : null;
  }

  clone(): NavHistory {
    const copy = new NavHistory();
    copy.entries = this.entries.map((entry) => ({ ...entry }));
    copy.cursor = this.cursor;
    return copy;
  }

  push(entry: NavEntry): void {
    this.entries = this.entries.slice(0, this.cursor + 1);
    if (this.current?.path === entry.path) {
      this.updateCurrent(entry);
      return;
    }
    this.entries.push({ ...entry });
    if (this.entries.length > 100) this.entries.shift();
    this.cursor = this.entries.length - 1;
  }

  back(): NavEntry | null {
    if (!this.canBack) return null;
    return this.entryAt(--this.cursor);
  }

  forward(): NavEntry | null {
    if (!this.canForward) return null;
    return this.entryAt(++this.cursor);
  }

  updateCurrent(partial: Partial<NavEntry>): void {
    if (this.cursor < 0) return;
    this.entries[this.cursor] = { ...this.entries[this.cursor], ...partial };
  }

  /** Preserve the current entry if possible; otherwise prefer its nearest predecessor. */
  remove(path: string): void {
    const throughCurrent = this.entries.slice(0, this.cursor + 1)
      .filter((entry) => entry.path !== path).length;
    this.entries = this.entries.filter((entry) => entry.path !== path);
    this.cursor = this.entries.length ? Math.max(0, throughCurrent - 1) : -1;
  }

  clear(): void {
    this.entries = [];
    this.cursor = -1;
  }
}
