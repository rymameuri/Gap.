# Gap

The Gap learning workspace, organized into frontend, backend, and shared data folders.
The site name and visual identity remain Gap.

## Run locally

```sh
npm install
npm run dev
```

Use Node.js 22.12 or newer. Open http://localhost:3000/student/ for the React and TypeScript student workspace, or http://localhost:3000 for the existing landing page. Vite prints a different port if 3000 is already in use.

## Project structure

- `apps/frontend/index.html`: landing entry point.
- `apps/frontend/src/app.js`: navigation and application actions.
- `apps/frontend/src/pages/instructor/`: teacher screens and entry point.
- `apps/frontend/src/pages/student/`: student screens and entry point.
- `apps/frontend/src/pages/landing.js`: interactive landing page.
- `apps/frontend/src/components/`: shared interface elements.
- `apps/frontend/src/layouts/`: workspace layout.
- `apps/frontend/src/services/`: session-scoped demo state.
- `apps/frontend/src/styles.css`: current Gap theme.
- `apps/backend/`: reserved for backend implementation; not connected yet.
- `data/demo-state.js`: sample class, quiz and misconception data.

The teacher and student workspaces live at `/teacher/` and `/student/`.
Sample data is shared within a browser tab. Live AI and real accounts are not connected.

## Static output

```sh
npm run build
```

The static site is generated in `dist/`. Source code lives in `src/`, not in generated output.
Hosting configuration remains local and is excluded from Git.
