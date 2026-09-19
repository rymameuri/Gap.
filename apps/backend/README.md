# Gap backend

Express + TypeScript with persistent SQLite, authenticated APIs, a durable generation queue, three teaching agents and an auditable review/recheck loop. See the repository README and `docs/architecture.md`.

## Layout

| Path                  | Responsibility                                                                  |
| --------------------- | ------------------------------------------------------------------------------- |
| `src/app.ts`          | Builds the Express app: middleware, route registration, static frontend, errors |
| `src/routes/`         | HTTP handlers per area; they read parameters and call a service                 |
| `src/services/`       | Business rules, ownership checks and transactions                               |
| `src/repositories/`   | Every SQL statement, returning typed rows (`src/rows.ts`)                       |
| `src/validation.ts`   | Request body schemas                                                            |
| `src/json-columns.ts` | Parsing of JSON-encoded columns                                                 |
| `src/migrations/`     | Schema migrations                                                               |
| `src/jobs.ts`         | Queue for agent generation tasks                                                |
| `src/agents/`         | Agent logic, owned by the agents team                                           |
| `app/ai/`             | Private FastAPI AI sidecar, Python agents, RAG and model client                 |

Services parse request bodies at the same step as before the split, so ownership and state checks still answer before body validation. The backend compiles with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

## Configuration

The server reads environment variables once at startup through `loadConfig` in `src/config.ts` and exits with a single `invalid configuration` log line listing every problem. Empty values count as unset. Only `src/index.ts` reads `process.env`; ESLint enforces this outside `src/agents`.

| Variable            | Default                           | Notes                                                                 |
| ------------------- | --------------------------------- | --------------------------------------------------------------------- |
| `NODE_ENV`          | `development`                     | `development`, `test` or `production`. Production sets secure cookies |
| `API_HOST`          | `127.0.0.1`                       |                                                                       |
| `API_PORT`          | `3001`                            |                                                                       |
| `WEB_PORT`          | `3000`                            | Frontend dev port; its localhost origins may send writes              |
| `APP_ORIGIN`        | unset                             | Extra allowed origin, for example `https://app.example.com`           |
| `DATABASE_PATH`     | `.runtime/gap.sqlite`             |                                                                       |
| `DEMO_PASSWORD`     | `GapDemo!2026` outside production | Required in production. Minimum 8 characters                          |
| `LOG_LEVEL`         | `info`                            | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`        |
| `TRUST_PROXY`       | `0`                               | Number of reverse proxies in front of the app, 0 to 10                |
| `AI_SERVICE_URL`    | unset                             | Private FastAPI base URL, normally `http://127.0.0.1:8001`            |
| `AI_INTERNAL_TOKEN` | unset                             | Shared bridge token, at least 32 characters; must be set with the URL |

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

## Gap priority explanations

Each open gap cluster in `GET /api/teacher/workspace` carries a `priorityExplanation`. The dashboard ranks clusters by `priority`, the sum of the severities of their open gaps, which equals the number of affected students times their mean severity. The explanation splits a cluster's priority into those two factors with exact Shapley values (SHAP), using the class's open clusters as the background:

```json
{
  "method": "exact-shapley",
  "baseline": 17.5,
  "prediction": 36,
  "attributions": [
    { "feature": "students", "value": 12, "contribution": 13.25 },
    { "feature": "severity", "value": 3, "contribution": 5.25 }
  ]
}
```

`baseline` is the mean priority of the open clusters, and `baseline` plus the contributions equals `priority`. A positive contribution means the factor raises the cluster above the class average. `src/explain/shapley.ts` enumerates every coalition, so the values are exact and deterministic, not sampled. Tests check them against the permutation definition of Shapley values, and they were checked against `shap.explainers.Exact` from the Python `shap` package, which gives identical values within floating-point rounding.

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
| 503    | `service_unavailable`                              |

Routes throw the typed errors in `src/errors.ts`; `errorHandler` in `src/http/middleware.ts` turns them into responses. Any other error returns a generic 500 and is logged with its stack, so internal details never reach the client.

## Logging

Logs are JSON lines on stdout (pino). Each request gets an id, returned in the `X-Request-Id` response header and attached to every log line for that request. A well-formed incoming `X-Request-Id` is reused. One `request completed` line is written per request with method, path (without query string), status, duration and user id. Password, token, cookie and authorization fields are redacted.

## Operations

### Local development

```sh
npm ci
cd apps/backend
python -m venv .venv
.venv/bin/python -m pip install -r requirements-ai.txt
cd ../..
npm run dev
```

On Windows, use `.\.venv\Scripts\python.exe` instead of `.venv/bin/python`.

When `AI_SERVICE_URL` and `AI_INTERNAL_TOKEN` are both configured, the development launcher also starts Uvicorn from `apps/backend/.venv`. QuantumBlack credentials stay in ignored `apps/backend/.env`; the bridge token stays in the ignored root `.env`.

The frontend runs on `WEB_PORT` (3000) and proxies `/api` to the backend on `API_PORT` (3001). On start the backend applies pending migrations and, when the database has no users, seeds the demo course and accounts.

### Production

1. `npm ci`, then `npm run build`. The build compiles the frontend into `dist` and the backend into `apps/backend/build`.
2. Set `NODE_ENV=production`, `DEMO_PASSWORD`, `DATABASE_PATH` on a persistent disk, and `API_HOST`/`API_PORT`. Behind a load balancer or platform router, set `TRUST_PROXY` to the number of proxies. Without it, every client shares one rate limit, and writes from the app's own https origin are refused unless `APP_ORIGIN` names it.
3. `npm start`. It migrates the database, then serves the API and the built frontend from one process.

Run exactly one process per database file. sql.js keeps the database in memory and writes the file on every change, and the agent queue runs in process, so replicas would overwrite each other.

### Health and logs

`GET /api/health` needs no session and returns `{ "ok": true, "engine": "local" | "live-ai", "database": "sqlite" }`. Logs are JSON lines on stdout. Use the `X-Request-Id` of a response to find its log lines. `level` 50 marks unexpected errors, logged with their stack.

### Backup and restore

The database is the single file at `DATABASE_PATH`. Every change writes a temporary file and renames it over the original, so copying the file at any time gives a consistent backup. To restore, stop the server, replace the file, and start it. A backup from older code is migrated on start. A backup from newer code is refused (see below).

### Troubleshooting

| Log message                    | Meaning and action                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid configuration`        | `issues` lists every invalid or missing variable. Fix them and restart.                                                                        |
| `database migration refused`   | The database was migrated by newer code. Deploy that version, or restore a backup made by this version.                                        |
| `X-Forwarded-For received ...` | A proxy is in front of the app but `TRUST_PROXY` is 0. Set it to the number of proxies.                                                        |
| `agent task failed`            | A quiz or explanation job failed. `err` holds the cause; the job and the class activity feed show the message. The teacher can queue it again. |
| `agent queue stopped`          | The queue hit a database error. Restart the process; queued and interrupted jobs run again.                                                    |

## Checks

Run all backend checks from the repository root:

```sh
npm run check:backend
```

| Script                         | Scope                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `npm run typecheck:backend`    | Backend sources, tests and tools under strict TypeScript                                      |
| `npm run lint:backend`         | ESLint with typescript-eslint strict type-checked rules                                       |
| `npm run format:check:backend` | Prettier on backend files                                                                     |
| `npm test`                     | Backend and tool tests (`node:test`, Node 22 or later)                                        |
| `npm run test:coverage`        | The same tests with coverage thresholds: 95% lines, 90% branches, 95% functions. CI runs this |
| `npm run check:forbidden`      | Forbidden characters and phrases in backend-owned files                                       |

`src/agents/` is owned by the agents team and is excluded from lint and the forbidden-character scan.

### Lint exceptions

There is no suppression baseline. A rule may be relaxed only with an inline `eslint-disable-next-line <rule> -- <reason>` next to the code it covers. The two current exceptions are in `src/db.ts`: the untyped default `Row` that `src/agents` relies on, and the row type parameter of `Store.one`.

### Git hooks

`npm ci` sets `core.hooksPath` to `.githooks`. The `pre-commit` hook scans staged backend files, and `commit-msg` checks the message of any commit that touches backend files. Commits that only touch frontend files are not checked.

## Importing course documents

Teacher Class materials accepts PDF, DOCX, PPTX and TXT. Binary documents are sent through an authenticated, class-owner-only Express endpoint to the private Python document reader. The extracted text replaces the editor preview; it is persisted only after the teacher selects Save materials. Failed imports keep the previous text.

The file limit is 25 MiB. The current editor and course API allow 50,000 UTF-16 code units of text, so larger documents must be split. Password-protected PDFs and image-only scans are rejected with an explanation; OCR is not included. Older DOC and PPT files must be exported to DOCX or PPTX. Original files are not retained: text, including page/slide labels, is saved in the existing syllabus field. This import flow does not add a document library or separate page-level citation metadata.

Run `npm run dev` with `AI_SERVICE_URL` and `AI_INTERNAL_TOKEN` configured to start the reader with the app. Reading documents does not call the LLM. Existing text-file imports can also run directly in the browser.
