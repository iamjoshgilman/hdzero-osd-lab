import { describe, it, expect } from "vitest";
import { UndoStack } from "./undo";

describe("UndoStack", () => {
  it("empty stack cannot undo or redo", () => {
    const s = new UndoStack<number>();
    expect(s.canUndo()).toBe(false);
    expect(s.canRedo()).toBe(false);
    expect(s.undo(1)).toBeNull();
    expect(s.redo(1)).toBeNull();
  });

  it("push + undo returns the previous snapshot", () => {
    const s = new UndoStack<number>();
    s.push(1);
    expect(s.undo(2)).toBe(1);
    expect(s.canUndo()).toBe(false);
    expect(s.canRedo()).toBe(true);
  });

  it("undo + redo returns the undone state", () => {
    const s = new UndoStack<number>();
    s.push(1); // past=[1]
    const undone = s.undo(2); // past=[], future=[2]
    expect(undone).toBe(1);
    const redone = s.redo(1);
    expect(redone).toBe(2);
    expect(s.canUndo()).toBe(true);
    expect(s.canRedo()).toBe(false);
  });

  it("pushing new state after undo clears redo future", () => {
    const s = new UndoStack<number>();
    s.push(1);
    s.undo(2); // past=[], future=[2]
    expect(s.canRedo()).toBe(true);
    s.push(3); // should wipe future
    expect(s.canRedo()).toBe(false);
  });

  it("respects the history limit", () => {
    const s = new UndoStack<number>(3);
    for (let i = 0; i < 10; i++) s.push(i);
    expect(s.size.past).toBe(3);
    // Oldest snapshots were dropped; the remaining top of the stack is 9.
    expect(s.undo(10)).toBe(9);
  });

  it("clear() wipes both stacks", () => {
    const s = new UndoStack<number>();
    s.push(1);
    s.push(2);
    s.undo(3);
    s.clear();
    expect(s.canUndo()).toBe(false);
    expect(s.canRedo()).toBe(false);
  });
});
