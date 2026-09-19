import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword, openStore, type Store } from "./db.js";
import {
  MigrationError,
  appliedMigrations,
  migrate,
  rollback,
  schemaSnapshot,
} from "./migrate.js";
import {
  MIGRATIONS,
  learningRecords,
  type Migration,
} from "./migrations/index.js";
import { SCHEMA_SNAPSHOT_FILE, renderSchemaSnapshot } from "./schema-file.js";
import { seed } from "./seed.js";

const LEGACY_SCHEMA = new URL(
  "../test/fixtures/legacy-schema.sql",
  import.meta.url,
);
const IDS = MIGRATIONS.map((migration) => migration.id);
const JOIN_CODE = /^[A-Z2-9]{8}$/;

const blank = () => openStore(":memory:", { migrate: false });

async function legacyStore(withJoinCode: boolean): Promise<Store> {
  const store = await blank();
  store.db.exec(await readFile(LEGACY_SCHEMA, "utf8"));
  if (withJoinCode) {
    store.db.exec("ALTER TABLE classes ADD COLUMN join_code TEXT");
    store.db.exec(
      "CREATE UNIQUE INDEX classes_join_code ON classes(join_code)",
    );
  }
  store.run("INSERT INTO users VALUES(?,?,?,?,?)", [
    "t1",
    "Teacher",
    "t1@example.com",
    "teacher",
    hashPassword("password-1"),
  ]);
  store.run(
    "INSERT INTO classes(id,teacher_id,name,syllabus) VALUES('c1','t1','Physics','Units')",
  );
  return store;
}

function tableNames(store: Store): string[] {
  return store
    .all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    .map((row) => row.name);
}

describe("migrate", () => {
  test("applies every migration to an empty database", async () => {
    const store = await blank();
    const result = migrate(store);
    assert.deepEqual(result, { adopted: [], applied: IDS });
    assert.deepEqual(appliedMigrations(store), IDS);
  });

  test("is a no-op when up to date", async () => {
    const store = await openStore(":memory:");
    assert.deepEqual(migrate(store), { adopted: [], applied: [] });
  });

  test("openStore migrates unless told not to", async () => {
    assert.deepEqual(appliedMigrations(await openStore(":memory:")), IDS);
    assert.deepEqual(appliedMigrations(await blank()), []);
  });

  test("each migration reverses exactly and applies again", async () => {
    const store = await blank();
    migrate(store, []);
    const snapshots = [schemaSnapshot(store)];
    for (const migration of MIGRATIONS) {
      migrate(store, MIGRATIONS.slice(0, MIGRATIONS.indexOf(migration) + 1));
      snapshots.push(schemaSnapshot(store));
    }
    for (let level = MIGRATIONS.length; level > 0; level--) {
      rollback(store, 1);
      assert.equal(schemaSnapshot(store), snapshots[level - 1]);
    }
    migrate(store);
    assert.equal(schemaSnapshot(store), snapshots.at(-1));
  });

  test("rolling back the join code keeps class data and reapplying fills codes", async () => {
    const store = await openStore(":memory:");
    seed(store, "demo-password");
    const before = store.all(
      "SELECT id,name,syllabus FROM classes ORDER BY id",
    );
    assert.deepEqual(
      rollback(store, MIGRATIONS.length - 1),
      IDS.slice(1).reverse(),
    );
    assert.deepEqual(
      store.all("SELECT id,name,syllabus FROM classes ORDER BY id"),
      before,
    );
    migrate(store);
    const codes = store
      .all<{ join_code: string }>("SELECT join_code FROM classes")
      .map((row) => row.join_code);
    assert.ok(codes.every((code) => JOIN_CODE.test(code)));
    assert.equal(new Set(codes).size, codes.length);
  });

  test("rolls back the baseline to an empty database", async () => {
    const store = await openStore(":memory:");
    seed(store, "demo-password");
    assert.deepEqual(rollback(store, IDS.length), [...IDS].reverse());
    assert.deepEqual(tableNames(store), ["schema_migrations"]);
  });

  test("refuses invalid rollback step counts", async () => {
    const store = await openStore(":memory:");
    for (const steps of [0, -1, 1.5, IDS.length + 1])
      assert.throws(() => rollback(store, steps), MigrationError);
    assert.deepEqual(appliedMigrations(store), IDS);
  });

  test("a failing migration leaves no trace", async () => {
    const store = await openStore(":memory:");
    const before = schemaSnapshot(store);
    const failing: Migration = {
      id: "9999-failing",
      up(target) {
        target.run("CREATE TABLE half_done(id TEXT)");
        target.run("INSERT INTO missing_table VALUES(1)");
      },
      down() {
        assert.fail("down must not run");
      },
    };
    assert.throws(
      () => migrate(store, [...MIGRATIONS, failing]),
      /missing_table/,
    );
    assert.equal(schemaSnapshot(store), before);
    assert.deepEqual(appliedMigrations(store), IDS);
  });

  test("refuses a database migrated by newer code", async () => {
    const store = await openStore(":memory:");
    store.run(
      "INSERT INTO schema_migrations(id,applied_at) VALUES('9999-future','2026-01-01T00:00:00.000Z')",
    );
    assert.throws(() => migrate(store), MigrationError);
    assert.throws(() => rollback(store, 1), MigrationError);
  });

  test("refuses a migration list that is not strictly ordered", async () => {
    const store = await blank();
    const first = MIGRATIONS.at(0);
    const second = MIGRATIONS.at(1);
    assert.ok(first !== undefined && second !== undefined);
    assert.throws(() => migrate(store, [second, first]), MigrationError);
    assert.throws(() => migrate(store, [first, first]), MigrationError);
    assert.deepEqual(appliedMigrations(store), []);
  });
});

describe("join code backfill", () => {
  test("0003 fills codes missing from classes created after 0002", async () => {
    const store = await blank();
    migrate(store, MIGRATIONS.slice(0, 2));
    store.run(
      "INSERT INTO users VALUES('t1','T','t1@example.com','teacher','x')",
    );
    store.run(
      "INSERT INTO classes(id,teacher_id,name,syllabus) VALUES('c1','t1','Physics','Units')",
    );
    assert.deepEqual(migrate(store).applied, IDS.slice(2));
    const course = store.one<{ join_code: string }>(
      "SELECT join_code FROM classes WHERE id='c1'",
    );
    assert.ok(course);
    assert.match(course.join_code, JOIN_CODE);
  });

  test("the seed gives the demo class a join code", async () => {
    const store = await openStore(":memory:");
    seed(store, "demo-password");
    const codes = store.all<{ join_code: string | null }>(
      "SELECT join_code FROM classes",
    );
    assert.ok(codes.length > 0);
    for (const { join_code } of codes) assert.match(join_code ?? "", JOIN_CODE);
  });
});

describe("legacy databases", () => {
  test("adopts a database that already has join codes without touching data", async () => {
    const store = await legacyStore(true);
    const result = migrate(store);
    assert.deepEqual(result, {
      adopted: ["0001-baseline", "0002-class-join-code"],
      applied: IDS.slice(2),
    });
    const course = store.one<{ name: string; join_code: string }>(
      "SELECT name,join_code FROM classes WHERE id='c1'",
    );
    assert.ok(course);
    assert.equal(course.name, "Physics");
    assert.match(course.join_code, JOIN_CODE);
    assert.ok(store.one("SELECT 1 FROM users WHERE id='t1'"));
  });

  test("adopts the baseline and adds join codes to an older database", async () => {
    const store = await legacyStore(false);
    const result = migrate(store);
    assert.deepEqual(result, {
      adopted: ["0001-baseline"],
      applied: IDS.slice(1),
    });
    const course = store.one<{ join_code: string }>(
      "SELECT join_code FROM classes WHERE id='c1'",
    );
    assert.ok(course);
    assert.match(course.join_code, JOIN_CODE);
  });

  test("adopted databases match a fresh schema structurally", async () => {
    const adopted = await legacyStore(true);
    migrate(adopted);
    const fresh = await openStore(":memory:");
    const columns = (store: Store) =>
      tableNames(store).map((table) => [
        table,
        store.all(`PRAGMA table_info(${table})`),
        store.all(`PRAGMA index_list(${table})`).length,
      ]);
    assert.deepEqual(columns(adopted), columns(fresh));
  });
});

test("adopts the early learning-records migration without losing existing data", async () => {
  const store = await blank();
  migrate(store, MIGRATIONS.slice(0, 3));
  seed(store, "demo-password");
  store.transaction(() => {
    learningRecords.up(store);
    store.run("ALTER TABLE agent_reviews DROP COLUMN message_id");
    store.run(
      "INSERT INTO schema_migrations(id,applied_at) VALUES('0004-learning-records','2026-09-19T00:00:00.000Z')",
    );
    store.run(
      "INSERT INTO conversations(id,class_id,student_id,title,created_at,updated_at) VALUES('old-chat','physics','sara','Old chat','2026-09-19T00:00:00.000Z','2026-09-19T00:00:00.000Z')",
    );
    store.run(
      "INSERT INTO agent_reviews(id,class_id,student_id,conversation_id,kind,content,sources,issues,status,created_at) VALUES('old-review','physics','sara','old-chat','study_response','Review me','[]','[]','pending','2026-09-19T00:00:00.000Z')",
    );
  });
  assert.deepEqual(migrate(store), {
    adopted: ["0005-learning-records"],
    applied: [
      "0004-gap-resolutions",
      "0006-class-invitations",
      "0007-workflow-traces",
    ],
  });
  assert.deepEqual(appliedMigrations(store), IDS);
  assert.ok(store.one("SELECT 1 FROM gap_resolutions LIMIT 1") === undefined);
  const review = store.one<{ content: string; message_id: string | null }>(
    "SELECT content,message_id FROM agent_reviews WHERE id='old-review'",
  );
  assert.deepEqual(review, { content: "Review me", message_id: null });
  assert.deepEqual(migrate(store), { adopted: [], applied: [] });
  store.db.close();
});

describe("persistence", () => {
  test("a migrated file database reopens without re-running migrations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "migrate-"));
    try {
      const file = join(directory, "app.sqlite");
      const first = await openStore(file);
      seed(first, "demo-password");
      first.db.close();
      const reopened = await openStore(file, { migrate: false });
      assert.deepEqual(migrate(reopened), { adopted: [], applied: [] });
      assert.ok(reopened.one("SELECT 1 FROM users WHERE id='teacher'"));
      reopened.db.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

test("data/schema.sql matches the migrations", async () => {
  assert.equal(
    (await readFile(SCHEMA_SNAPSHOT_FILE, "utf8")).replaceAll("\r\n", "\n"),
    await renderSchemaSnapshot(),
    "data/schema.sql is stale; run `npm run db -- schema`",
  );
});
