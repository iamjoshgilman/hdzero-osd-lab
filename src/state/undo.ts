// Generic snapshot-based undo stack. Not immer/patch-based — we rely on the
// fact that ProjectDoc is cheap to structuredClone (≪ 100 KB typical) and a
// few hundred snapshots fit in memory fine.

const DEFAULT_LIMIT = 100;

export class UndoStack<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private readonly limit: number = DEFAULT_LIMIT) {}

  /** Record the current state as a prior snapshot. Clears any redo future. */
  push(current: T): void {
    this.past.push(current);
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
  }

  /** Return the previous state and remember `current` on the redo stack. */
  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    return prev;
  }

  /** Inverse of `undo`. */
  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }

  get size(): { past: number; future: number } {
    return { past: this.past.length, future: this.future.length };
  }
}
