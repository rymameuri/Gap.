import { backfillJoinCodes } from "../join-codes.js";
import type { Migration } from "./migration.js";

export const JOIN_CODE_INDEX = "classes_join_code";

export const classJoinCode: Migration = {
  id: "0002-class-join-code",
  up(store) {
    store.run("ALTER TABLE classes ADD COLUMN join_code TEXT");
    store.run(`CREATE UNIQUE INDEX ${JOIN_CODE_INDEX} ON classes(join_code)`);
    backfillJoinCodes(store);
  },
  down(store) {
    store.run(`DROP INDEX ${JOIN_CODE_INDEX}`);
    store.run("ALTER TABLE classes DROP COLUMN join_code");
  },
};
