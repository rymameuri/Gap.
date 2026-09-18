# Gap backend

Express + TypeScript with persistent SQLite, authenticated APIs, a durable generation queue, three teaching agents and an auditable review/recheck loop. See the repository README and `docs/architecture.md`.

## Configuration

The server reads environment variables once at startup through `loadConfig` in `src/config.ts` and exits with a single `invalid configuration` log line listing every problem. Empty values count as unset. Only `src/index.ts` reads `process.env`; ESLint enforces this outside `src/agents`.

| Variable        | Default                           | Notes                                                                 |
| --------------- | --------------------------------- | --------------------------------------------------------------------- |
| `NODE_ENV`      | `development`                     | `development`, `test` or `production`. Production sets secure cookies |
| `API_HOST`      | `127.0.0.1`                       |                                                                       |
| `API_PORT`      | `3001`                            |                                                                       |
| `WEB_PORT`      | `3000`                            | Frontend dev port; its localhost origins may send writes              |
| `APP_ORIGIN`    | unset                             | Extra allowed origin, for example `https://app.example.com`           |
| `DATABASE_PATH` | `.runtime/gap.sqlite`             |                                                                       |
| `DEMO_PASSWORD` | `GapDemo!2026` outside production | Required in production. Minimum 8 characters                          |
| `LOG_LEVEL`     | `info`                            | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`        |

The model provider variables in `.env.example` are read by `src/agents` and documented there by the agents team.

## API contract

`openapi.yaml` (OpenAPI 3.1) documents every endpoint the frontend calls: paths, request bodies, response fields and status codes. It follows the frontend in `apps/frontend` (`services/api.ts`, `services/types.ts` and the calls in `pages/`). Fields the frontend reads are required; extra columns are allowed. Fields that must never reach a client, such as answer keys in student payloads or the score of a grade awaiting review, are forbidden with `not`.

`src/contract.test.ts` enforces it:

- every response the suite receives is validated against the documented schema for its operation and status, and an undocumented status fails;
- every documented operation and status must be exercised at least once;
- the Express routes and the documented paths must match exactly.

When the frontend adds or changes a call, update `openapi.yaml` in the same change as the backend, then add or adjust the matching case in `src/contract.test.ts`.

## Database migrations

The schema changes only through the ordered migrations in `src/migrations`. Each has an `up` and a `down`, runs in one transaction, and is recorded in the `schema_migrations` table. The server applies pending migrations at startup and logs them; it refuses to start against a database that has migrations this code does not know.

Databases created before migrations existed are adopted on first start: their existing tables are recorded as the baseline, and missing changes are applied. No data is rewritten.

```sh
npm run db -- status            # applied and pending migrations
npm run db -- migrate           # apply pending migrations
npm run db -- rollback [steps]  # revert the newest migrations, default 1
npm run db -- schema            # regenerate data/schema.sql
```

The commands use `DATABASE_PATH`. Rolling back `0001-baseline` drops every table and its data. After `npm run build`, run the compiled CLI with `node apps/backend/build/migrate-cli.js <command>`.

To change the schema, add the next numbered file in `src/migrations`, append it to `MIGRATIONS`, and run `npm run db -- schema`. Never edit or rename a released migration. `src/migrate.test.ts` checks that every migration reverses exactly.

## Errors

Every API error response has the same body:

```json
{ "error": "Quiz not found.", "code": "not_found" }
```

`error` is safe to show to users. `code` is stable for programmatic handling:

| Status | `code`                                             |
| ------ | -------------------------------------------------- |
| 400    | `bad_request`, `validation_failed`, `invalid_json` |
| 401    | `unauthenticated`, `invalid_credentials`           |
| 403    | `forbidden`, `origin_not_allowed`                  |
| 404    | `not_found`                                        |
| 409    | `conflict`                                         |
| 413    | `payload_too_large`                                |
| 429    | `rate_limited`                                     |
| 500    | `internal_error`                                   |

Routes throw the typed errors in `src/errors.ts`; `errorHandler` in `src/http/middleware.ts` turns them into responses. Any other error returns a generic 500 and is logged with its stack, so internal details never reach the client.

## Logging

Logs are JSON lines on stdout (pino). Each request gets an id, returned in the `X-Request-Id` response header and attached to every log line for that request. A well-formed incoming `X-Request-Id` is reused. One `request completed` line is written per request with method, path (without query string), status, duration and user id. Password, token, cookie and authorization fields are redacted.

## Checks

Run all backend checks from the repository root:

```sh
npm run check:backend
```

| Script                         | Scope                                                    |
| ------------------------------ | -------------------------------------------------------- |
| `npm run typecheck:backend`    | Backend sources, tests and tools under strict TypeScript |
| `npm run lint:backend`         | ESLint with typescript-eslint strict type-checked rules  |
| `npm run format:check:backend` | Prettier on backend files                                |
| `npm test`                     | Backend and tool tests (`node:test`, Node 22 or later)   |
| `npm run check:forbidden`      | Forbidden characters and phrases in backend-owned files  |

`src/agents/` is owned by the agents team and is excluded from lint and the forbidden-character scan.

### Lint baseline

`eslint-suppressions.json` records lint violations that predate the lint setup. New violations fail. When a change removes a recorded violation, ESLint fails until the file is pruned:

```sh
npx eslint apps/backend --prune-suppressions
```

Never add entries to the file by hand or with `--suppress-all`.

### Git hooks

`npm ci` sets `core.hooksPath` to `.githooks`. The `pre-commit` hook scans staged backend files, and `commit-msg` checks the message of any commit that touches backend files. Commits that only touch frontend files are not checked.
