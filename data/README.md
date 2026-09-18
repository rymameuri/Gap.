# Gap data

`schema.sql` is a generated, read-only view of the SQLite schema produced by the migrations in `apps/backend/src/migrations`. Regenerate it with `npm run db -- schema`; a backend test fails when it is stale. Demo physics topics and sample accounts are seeded by `apps/backend/src/seed.ts`. Runtime records live in the ignored `.runtime/gap.sqlite` file.
