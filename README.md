# Gap

A full-stack learning-gap workspace with a React/TypeScript frontend, an Express/TypeScript API, persistent SQLite storage, and a teacher-supervised learning loop.

## Quick start

Requires Node.js 20.19+ and Python 3.11+ for the AI sidecar.

```sh
npm install
cd apps/backend
python -m venv .venv
# Windows: .\.venv\Scripts\python.exe -m pip install -r requirements-ai.txt
# macOS/Linux: .venv/bin/python -m pip install -r requirements-ai.txt
cd ../..
npm run dev
```

Open http://localhost:3000. The React frontend runs on port 3000 and proxies API requests to port 3001.

Use the Teacher demo or Student demo buttons, or sign in with:

| Role           | Email            | Demo password |
| -------------- | ---------------- | ------------- |
| Teacher        | teacher@gap.demo | GapDemo!2026  |
| Student (Sara) | student@gap.demo | GapDemo!2026  |
| Student (Omar) | omar@gap.demo    | GapDemo!2026  |

These are deliberately seeded demonstration accounts and sample records. Set DEMO_PASSWORD before creating a fresh database to choose another password. Production seeding requires an explicit DEMO_PASSWORD.

## The working learning loop

1. Teacher supplies a syllabus and drafts an assessment.
2. Assessment generates questions and grades submissions against a rubric.
3. Grades below 80% confidence enter the review queue; students cannot see them until teacher approval.
4. Diagnostic groups published misconception evidence and ranks affected topics by frequency and severity.
5. Content prepares a focused explanation and a different follow-up question. The teacher reviews and approves it before students receive it.
6. A student completes the recheck. A correct answer resolves only that student's gap; a wrong answer keeps it open and escalates it for teacher support.
7. Outcomes update the dashboard and agent audit trail. All records persist across restarts.

## Local engine and live AI

Without model credentials, the backend uses an explicit local teaching engine for the three physics topics. Multiple-choice grading uses an answer key. Short-answer lexical evidence is deliberately held for teacher review, because keywords are not proof of semantic correctness.

The recommended model path is the private FastAPI sidecar. Keep QuantumBlack credentials in ignored `apps/backend/.env`, then set `AI_SERVICE_URL=http://127.0.0.1:8001` and a random `AI_INTERNAL_TOKEN` of at least 32 characters in the ignored root `.env`. `npm run dev` then starts React, Express and FastAPI together. Never commit or share either file.

The browser never calls FastAPI directly. Express authenticates the user, verifies class membership and supplies trusted course material. FastAPI performs course-scoped retrieval, routing, generation, citation checks and review. Existing assessment/content jobs use the same private sidecar while retaining their durable SQLite workflow and Zod output validation.

The model ID in the example was checked against the live gateway catalog during implementation. You can change it to another supported provider/model ID.

[Gateway API documentation](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions).

## Structure

- `apps/frontend/src/pages/`: React landing, authentication, teacher and student screens.
- `apps/frontend/src/components/`: shared typed UI and notices.
- `apps/frontend/src/layouts/`: separate teacher sidebar and student top-bar experiences.
- `apps/frontend/src/services/`: typed API client and session handling.
- `apps/backend/src/agents/`: Diagnostic, Assessment, Content, model adapter and validation schemas.
- `apps/backend/app/ai/`: FastAPI sidecar, orchestrator, Python agents, RAG and QuantumBlack client.
- `apps/backend/src/jobs.ts`: durable generation queue with restart recovery.
- `apps/backend/src/app.ts`: validated, role-protected API endpoints.
- `apps/backend/src/db.ts`: SQLite transactions and atomic on-disk persistence.
- `apps/backend/src/migrations/`: reversible schema migrations; `data/schema.sql` is the generated schema they produce.
- `.runtime/gap.sqlite`: local database, excluded from Git.
- `docs/architecture.md`: architecture and implementation boundaries.

Authentication uses scrypt password hashes, random session tokens stored as hashes, HttpOnly cookies, expiration, login rate limits, and same-origin checks. Every teacher operation verifies class ownership; every student operation verifies enrollment or gap ownership. Unpublished answer keys and uncertain scores are omitted from student responses.

## Validation and production build

```sh
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serves the compiled application at http://localhost:3001 (or API_PORT). For HTTPS hosting, set NODE_ENV=production, APP_ORIGIN, API_HOST and an explicit DEMO_PASSWORD before seeding. Deploy the Node application with a persistent writable disk; this backend is not a static-only deployment.

The SQLite export store and task runner support one Node process. Multiple replicas or heavy concurrency need a shared database and external queue. There is no public registration, password-reset flow, OCR, or real school roster integration yet.

The previous hosted static URL has not been replaced by this Node application. The rebuilt full-stack version runs locally until deployed to a Node-compatible host.

### QuantumBlack gateway

Set QB_CLIENT_ID and QB_CLIENT_SECRET in the ignored server .env file, or AZURE_OPENAI_API_KEY / QB_GATEWAY_TOKEN. QB_GATEWAY_ENDPOINT, QB_GATEWAY_MODEL and QB_GATEWAY_API_VERSION override the supplied defaults. QuantumBlack takes priority over Vercel when configured. Restart the server after changing credentials. Quiz generation, grading and explanations use validated JSON; provider failures are reported without silent fallback. Credentials stay out of the frontend and Git.

### Class dashboards and invitations

Teachers land on /teacher and can create a class with an optional syllabus. Each class receives a unique eight-character invitation code, shown on its card and inside the teacher workspace. Students land on /student and join through that code; repeated joins do not duplicate membership. Class links retain the selected classroom, and the backend validates membership before returning class-specific student activity. Existing databases migrate automatically without removing data.
