import { baseline } from "./0001-baseline.js";
import { classJoinCode } from "./0002-class-join-code.js";
import { backfillMissingJoinCodes } from "./0003-backfill-join-codes.js";
import { gapResolutions } from "./0004-gap-resolutions.js";
import { learningRecords } from "./0005-learning-records.js";
import { classInvitations } from "./0006-class-invitations.js";
import { workflowTraces } from "./0007-workflow-traces.js";
import { sources } from "./0007-sources.js";
import { presentations } from "./0008-presentations.js";
import { wellbeingFlags } from "./0009-wellbeing-flags.js";
import { companionMessages } from "./0010-companion-messages.js";
import { companionChats } from "./0011-companion-chats.js";
import { courseFileIndex } from "./0008-course-file-index.js";
import type { Migration } from "./migration.js";

export type { Migration };
export {
  baseline,
  classJoinCode,
  backfillMissingJoinCodes,
  gapResolutions,
  learningRecords,
  classInvitations,
  workflowTraces,
  sources,
  presentations,
  wellbeingFlags,
  companionMessages,
  companionChats,
  courseFileIndex,
};

/** Every migration in the order it is applied. Append only. */
export const MIGRATIONS: readonly Migration[] = [
  baseline,
  classJoinCode,
  backfillMissingJoinCodes,
  gapResolutions,
  learningRecords,
  classInvitations,
  sources,
  workflowTraces,
  courseFileIndex,
  presentations,
  wellbeingFlags,
  companionMessages,
  companionChats,
];
