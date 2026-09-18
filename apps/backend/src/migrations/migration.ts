import type { Store } from "../db.js";

/**
 * One reversible schema change. `up` and `down` run inside a transaction and
 * must leave the schema exactly as it was before `up` when run in sequence.
 */
export interface Migration {
  /** Sortable, unique and never renamed once released, e.g. "0003-add-topics". */
  readonly id: string;
  up(store: Store): void;
  down(store: Store): void;
}
