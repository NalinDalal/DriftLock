import { createDb, createStore, type Store } from "@driftlock/db";

const DEFAULT_URL =
  "postgres://driftlock:driftlock@127.0.0.1:5432/driftlock";

let cached: Store | null = null;

export function getStore(): Store {
  if (!cached) {
    cached = createStore(
      createDb(process.env.DATABASE_URL ?? DEFAULT_URL),
    );
  }
  return cached;
}