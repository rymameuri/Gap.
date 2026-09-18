# Manara AI backend handoff

## Status

- Integration branch: `integration/ai-backend`
- Integration base: `de9df43`
- Python AI tests: 70
- Provider: QuantumBlack Azure gateway
- Public backend: Express and TypeScript
- Private AI runtime: FastAPI and Python

## Ownership boundary

Create one shared Python `AIService` per FastAPI process. Express remains the only browser-facing API and the only source of authenticated identity, course membership and durable learning state.

```text
React
  -> Express (sessions, authorization, SQLite, jobs, OpenAPI)
       -> FastAPI over loopback with X-Manara-AI-Token
            -> AIService
                 -> router
                 -> Study Agent + course RAG
                 -> Assessment Agent
                 -> Diagnostic Agent
                 -> rule-based Reviewer
                 -> QuantumBlack client
```

The Express assessment/content workflow calls FastAPI's private model adapter and keeps its existing Zod validation, queue and transactions. The student assistant calls the Python Study Agent directly through Express. Do not expose FastAPI to the browser.

## P0 document boundary

The Python loaders support PDF, Word (`.docx`) and PowerPoint (`.pptx`) parsing. In the integrated P0 request path, Express sends the trusted syllabus text already stored for the class and FastAPI indexes it by `material_version`. A teacher-facing upload/storage route is not wired end to end yet; keep that as P2 rather than claiming file upload is complete.

## Local configuration

1. Keep QuantumBlack values in ignored `apps/backend/.env` using `apps/backend/.env.example` as the template.
2. In the ignored root `.env`, set both:

   ```dotenv
   AI_SERVICE_URL=http://127.0.0.1:8001
   AI_INTERNAL_TOKEN=<random value of at least 32 characters>
   ```

3. Install Python dependencies from `apps/backend`:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements-ai.txt -r requirements-ai-dev.txt
   ```

4. From the repository root, run `npm ci` once and then `npm run dev`. The development launcher starts React, Express and the local FastAPI sidecar when both bridge variables are set.

## Internal endpoints

- `GET /health`: authenticated sidecar health check.
- `POST /v1/study`: trusted course context to a reviewed, cited Study Agent response.
- `POST /v1/model-json`: private provider adapter for existing TypeScript agents; Express validates the returned object with Zod.

## Verification

From `apps/backend`:

```powershell
.\.venv\Scripts\python.exe -m compileall -q app
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m pytest tests/ai -q
```

From the repository root:

```powershell
npm run check:backend
npm run typecheck
npm run test:student
```

Never commit `.env`, tokens, client ids or client secrets.
