export class Observable {
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly snapshot = () => this.revision;

  changed() {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }
}
