// Where the ledger gets row identifiers. The Web Crypto global is available
// on every runtime the store may run on, unlike `node:crypto`. Tests that
// need predictable identifiers swap the source with `setIdSource`.

let source: () => string = () => globalThis.crypto.randomUUID();

export function newId(): string {
  return source();
}

/** Replaces the identifier source; returns a function that restores it. */
export function setIdSource(next: () => string): () => void {
  const previous = source;
  source = next;
  return () => {
    source = previous;
  };
}
