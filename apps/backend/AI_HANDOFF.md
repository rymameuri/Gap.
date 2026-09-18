# Manara AI Backend Handoff

## Status

The P0 AI subsystem is implemented on:

- Branch: `feat/ai-orchestration-rag`
- Latest AI implementation commit: `a9c52aa`
- AI tests: 64
- LLM provider: QuantumBlack Azure gateway
- Shared model deployment: configured through `.env`

## Architecture

The backend should use one shared `AIService` instance.

```text
FastAPI
  |
  +-- AIService
       |
       +-- Hybrid intent router
       +-- Study Agent
       |    +-- Course-scoped retrieval
       |    +-- Grounded explanations
       |    +-- Verified citations
       |
       +-- Assessment Agent
       |    +-- Grounded quiz generation
       |    +-- Private answer-key storage
       |    +-- Deterministic MCQ grading
       |    +-- Misconception tags
       |
       +-- Diagnostic Agent
       |    +-- Student risk summaries
       |    +-- Class misconception clusters
       |    +-- Follow-up verification
       |    +-- Resolved/still-struggling status
       |
       +-- Rule-based Reviewer
            +-- Publication checks
            +-- Grade-confidence checks
            +-- Human-review queue
```