import { baseline } from "./0001-baseline.js";
import { classJoinCode } from "./0002-class-join-code.js";
import type { Migration } from "./migration.js";

export type { Migration };
export { baseline, classJoinCode };

/** Every migration in the order it is applied. Append only. */
export const MIGRATIONS: readonly Migration[] = [baseline, classJoinCode];
