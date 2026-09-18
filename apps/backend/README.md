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
