import { describe, expect, it } from "vitest";
import type {
  PatchRequest,
  MergeFinalizeStatus,
  MergeResolution,
  MergeSessionStatus,
  ResolvedState,
  StateRef
} from "./types.js";

describe("MCP SDK public Ref and Merge contracts", () => {
  it("expresses valid tagged references and discriminated conflict choices", () => {
    const reference: StateRef = "branch/main";
    const state: ResolvedState = ("commit/" + "f".repeat(64)) as ResolvedState;
    const resolutions: MergeResolution[] = [
      { conflictId: "ours", choice: "ours" },
      { conflictId: "theirs", choice: "theirs" },
      { conflictId: "value", choice: "value", value: { next: null } }
    ];
    const pending: MergeSessionStatus = "ready";
    const committed: MergeFinalizeStatus = "merged";
    expect(reference).toBe("branch/main");
    expect(state.startsWith("commit/")).toBe(true);
    expect(resolutions).toHaveLength(3);
    expect([pending, committed]).toEqual(["ready", "merged"]);
  });

  it("rejects invalid choices and parameter combinations at compile time", () => {
    // @ts-expect-error Bare Branch names are not valid StateRefs.
    const bare: StateRef = "main";
    // @ts-expect-error A resolved State must have the commit/ prefix.
    const mutable: ResolvedState = "branch/main";
    // @ts-expect-error Choice=value always requires a value field.
    const missing: MergeResolution = { conflictId: "missing", choice: "value" };
    // @ts-expect-error Ours/theirs must not carry a replacement value.
    const illegal: MergeResolution = { conflictId: "illegal", choice: "ours", value: 1 };
    // @ts-expect-error Unknown choices are rejected.
    const unknown: MergeResolution = { conflictId: "unknown", choice: "auto" };
    // @ts-expect-error Merge result states are part of a closed enum.
    const other: MergeFinalizeStatus = "complete";
    // @ts-expect-error Object Patch requires a pinned immutable Commit base, not a movable Branch.
    const stalePatch: PatchRequest = { baseState: "branch/main", branch: "main", patch: "" };
    expect([bare, mutable, missing, illegal, unknown, other, stalePatch]).toHaveLength(7);
  });
});
