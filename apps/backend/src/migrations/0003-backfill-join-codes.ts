import { backfillJoinCodes } from "../join-codes.js";
import type { Migration } from "./migration.js";

// Databases created after 0002 but before the seed assigned a join code hold
// a demo class without one. Earlier code filled it on the first class listing;
// listing no longer writes, so this fills any code still missing.
export const backfillMissingJoinCodes: Migration = {
  id: "0003-backfill-join-codes",
  up(store) {
    backfillJoinCodes(store);
  },
  // Data only. The codes are valid either way, and 0002's down drops the column.
  down() {
    return;
  },
};
