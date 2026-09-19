import type { Migration } from "./migration.js";

export const sources: Migration = {
  id: "0007-sources",
  up(store) {
    store.run(`CREATE TABLE sources(
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  type TEXT NOT NULL CHECK(type IN ('deck','link')),
  name TEXT NOT NULL,
  url TEXT,
  status TEXT NOT NULL CHECK(status IN ('processing','ready','failed')),
  error TEXT,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
)`);
    store.run("CREATE INDEX sources_class ON sources(class_id)");
    store.run(
      "CREATE UNIQUE INDEX sources_class_url ON sources(class_id,url) WHERE url IS NOT NULL",
    );
  },
  down(store) {
    store.run("DROP TABLE sources");
  },
};
