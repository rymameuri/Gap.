# Gap backend

Express + TypeScript with persistent SQLite, authenticated APIs, a durable generation queue, three teaching agents and an auditable review/recheck loop. See the repository README and `docs/architecture.md`.

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
