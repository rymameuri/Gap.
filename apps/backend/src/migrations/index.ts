import { baseline } from "./0001-baseline.js";
import { classJoinCode } from "./0002-class-join-code.js";
import { backfillMissingJoinCodes } from "./0003-backfill-join-codes.js";
import { gapResolutions } from "./0004-gap-resolutions.js";
import { learningRecords } from "./0005-learning-records.js";
import type { Migration } from "./migration.js";

export type { Migration };
export {
  baseline,
  classJoinCode,
  backfillMissingJoinCodes,
  gapResolutions,
  learningRecords,
};

/** Every migration in the order it is applied. Append only. */
export const MIGRATIONS: readonly Migration[] = [
  baseline,
  classJoinCode,
  backfillMissingJoinCodes,
  gapResolutions,
  learningRecords,
];
