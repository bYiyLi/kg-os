import { expect, it } from "vitest";

import { stateRef } from "./version-data.js";
import type { VersionCommit } from "./version-data.js";
import { layoutVersionTopology } from "./version-topology.js";

function commit(name: string, parents: string[] = [], committedAt = 1): VersionCommit {
  return {
    state: stateRef(name.repeat(64)),
    parents: parents.map((parent) => stateRef(parent.repeat(64))),
    committedAt,
    message: name,
    reachableFrom: ["knowledge"],
    refs: [],
    merge: parents.length > 1
  };
}

it("draws every merge parent and rejoins the common ancestor once", () => {
  const versions = [commit("a", ["b", "c"]), commit("b", ["d"]), commit("c", ["d"]), commit("d")];
  const graph = layoutVersionTopology(versions);
  expect(graph.nodes.map((node) => node.state)).toEqual(versions.map((version) => version.state));
  expect(graph.edges.map((edge) => [edge.child.state, edge.parent.state])).toEqual([
    [versions[0]?.state, versions[1]?.state],
    [versions[0]?.state, versions[2]?.state],
    [versions[1]?.state, versions[3]?.state],
    [versions[2]?.state, versions[3]?.state]
  ]);
  const left = graph.nodes.find((node) => node.state === versions[1]?.state);
  const right = graph.nodes.find((node) => node.state === versions[2]?.state);
  expect(left?.lane).not.toBe(right?.lane);
  expect(graph.nodes.filter((node) => node.state === versions[3]?.state)).toHaveLength(1);
  expect(graph.edges.every((edge) => edge.child.row < edge.parent.row)).toBe(true);
});

it("uses the pinned topology order even when a parent timestamp is newer", () => {
  const child = commit("a", ["b"], 1000);
  const parent = commit("b", [], 9000);
  const graph = layoutVersionTopology([child, parent]);
  expect(graph.nodes.map((node) => node.state)).toEqual([child.state, parent.state]);
  expect(graph.edges).toHaveLength(1);
  expect(graph.edges[0]?.child.state).toBe(child.state);
  expect(graph.edges[0]?.parent.state).toBe(parent.state);
});

it("does not connect unrelated roots merely because they share a lane", () => {
  const graph = layoutVersionTopology([commit("a"), commit("b")]);
  expect(graph.nodes).toHaveLength(2);
  expect(graph.nodes.every((node) => node.commit !== null)).toBe(true);
  expect(graph.edges).toEqual([]);
});

it("marks a shared unread parent as one endpoint instead of inventing a root", () => {
  const versions = [commit("a", ["b", "c"]), commit("b", ["d"]), commit("c", ["d"])];
  const graph = layoutVersionTopology(versions);
  const unread = graph.nodes.filter((node) => node.commit === null);
  expect(unread).toHaveLength(1);
  expect(unread[0]?.state).toBe(stateRef("d".repeat(64)));
  expect(graph.edges.filter((edge) => edge.parent === unread[0])).toHaveLength(2);
  expect(graph.edges).toHaveLength(4);
});

it("replaces the continuation endpoint with its real version after pagination", () => {
  const child = commit("a", ["b"]);
  const parent = commit("b", ["c"]);
  const before = layoutVersionTopology([child]);
  const after = layoutVersionTopology([child, parent]);
  expect(before.nodes.find((node) => node.state === parent.state)?.commit).toBeNull();
  expect(after.nodes.find((node) => node.state === parent.state)?.commit).toBe(parent);
  expect(after.nodes.filter((node) => node.state === parent.state)).toHaveLength(1);
  expect(after.nodes.find((node) => node.state === stateRef("c".repeat(64)))?.commit).toBeNull();
  expect(after.edges.map((edge) => [edge.child.state, edge.parent.state])).toEqual([
    [child.state, parent.state],
    [parent.state, stateRef("c".repeat(64))]
  ]);
});

it("does not duplicate parent edges repeated in an ancestry response", () => {
  const child = commit("a", ["b", "b"]);
  const parent = commit("b");
  const graph = layoutVersionTopology([child, parent]);
  expect(graph.nodes).toHaveLength(2);
  expect(graph.edges).toHaveLength(1);
  expect(graph.edges[0]?.parent.state).toBe(parent.state);
});

it("rejects self-parenting and cyclic ancestry rather than drawing false forward history", () => {
  expect(() => layoutVersionTopology([commit("a", ["a"])])).toThrow(
    "Invalid reverse-topological version ancestry"
  );
  expect(() => layoutVersionTopology([commit("a", ["b"]), commit("b", ["a"])])).toThrow(
    "Invalid reverse-topological version ancestry"
  );
});

it("rejects a loaded parent before its child instead of sorting by time or making up edges", () => {
  expect(() => layoutVersionTopology([commit("b", [], 100), commit("a", ["b"], 200)])).toThrow(
    "Invalid reverse-topological version ancestry"
  );
});

it("returns no nodes or relationships for an empty loaded ancestry", () => {
  const graph = layoutVersionTopology([]);
  expect(graph.nodes).toEqual([]);
  expect(graph.edges).toEqual([]);
});
