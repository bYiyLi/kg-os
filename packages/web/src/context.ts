import { type EvolutionRefItem } from "@kgos/sdk";

import { type Connection } from "./connection.js";
import { Observable } from "./observable.js";

export class Context extends Observable {
  inputRef = "branch/main";
  state = "";
  targetBranch = "main";
  branches: EvolutionRefItem[] = [];
  tags: EvolutionRefItem[] = [];
  resolving = false;
  switchError = "";
  observationError = "";
  observedAt = 0;
  private generation = 0;
  private switching: AbortController | undefined;
  private observation: Promise<void> | undefined;

  constructor(readonly connection: Connection) {
    super();
  }

  get runnable() {
    return (
      this.state !== "" &&
      !this.resolving &&
      this.switchError === "" &&
      this.connection.client !== undefined
    );
  }

  get targetHead() {
    return this.branches.find((branch) => branch.name === this.targetBranch)?.state;
  }

  get editable() {
    return (
      this.runnable &&
      this.inputRef === `branch/${this.targetBranch}` &&
      this.targetHead === this.state
    );
  }

  get observedTarget() {
    if (this.inputRef.startsWith("branch/"))
      return this.branches.find((ref) => `branch/${ref.name}` === this.inputRef)?.state;
    if (this.inputRef.startsWith("tag/"))
      return this.tags.find((ref) => `tag/${ref.name}` === this.inputRef)?.state;
    return this.state;
  }

  get refMissing() {
    return this.observedAt !== 0 && this.observedTarget === undefined;
  }

  get headChanged() {
    return this.observedTarget !== undefined && this.observedTarget !== this.state;
  }

  async select(inputRef: string, pinned?: string): Promise<boolean> {
    const client = this.connection.client;
    if (client === undefined) return false;
    this.switching?.abort();
    const controller = this.connection.controller();
    this.switching = controller;
    const generation = ++this.generation;
    this.resolving = true;
    this.switchError = "";
    this.changed();
    try {
      const result = await client.evolution.get(
        { state: pinned ?? inputRef },
        { signal: controller.signal }
      );
      if (generation !== this.generation || controller.signal.aborted) return false;
      this.inputRef = inputRef;
      this.state = result.state;
      if (inputRef.startsWith("branch/")) this.targetBranch = inputRef.slice(7);
      return true;
    } catch (error) {
      if (generation === this.generation) this.switchError = this.connection.failure(error);
      return false;
    } finally {
      this.connection.release(controller);
      if (generation === this.generation) this.resolving = false;
      this.changed();
    }
  }

  resumeCurrent() {
    this.switchError = "";
    this.changed();
  }

  observe(): Promise<void> {
    this.observation ??= this.readRefs().finally(() => {
      this.observation = undefined;
    });
    return this.observation;
  }

  private async readRefs(): Promise<void> {
    const client = this.connection.client;
    if (client === undefined) return;
    const controller = this.connection.controller();
    try {
      const [branches, tags] = await Promise.all([
        client.evolution.branch.list({ signal: controller.signal }),
        client.evolution.tag.list({ signal: controller.signal })
      ]);
      if (controller.signal.aborted || this.connection.client !== client) return;
      this.branches = branches.items;
      this.tags = tags.items;
      this.observedAt = Date.now();
      this.observationError = "";
    } catch (error) {
      if (this.connection.client === client) this.observationError = this.connection.failure(error);
    } finally {
      this.connection.release(controller);
      this.changed();
    }
  }
}
