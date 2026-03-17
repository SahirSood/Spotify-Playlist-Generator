# Agent Instructions

Read [docs/PRD.md](./docs/PRD.md) before proposing architecture changes, new features, refactors, or implementation plans.

This repository already has an implemented stack and product direction. Do not replace it with a generic Spotify playlist app design.

## Required Context

Use the PRD as the source of truth for:

- current architecture
- current MVP scope
- existing API contracts
- existing DynamoDB tables
- current OpenAI usage
- cost-saving design decisions

## Implementation Rules

- Preserve the current stack unless explicitly asked to change it:
  - `frontend/` React app
  - `backend/` Node/Express Lambda API
  - `backend-python/` Python ML Lambda
  - DynamoDB storage
- Treat playlist generation as cluster-based unless the user explicitly requests a new generation path.
- Prefer extending existing flows over rebuilding them:
  - sync listening data
  - enrich events
  - classify songs
  - cluster users
  - match a request to a cluster
  - create Spotify playlists
- Optimize for low token usage:
  - reuse cached song features
  - avoid sending raw listening history to the LLM
  - prefer compact structured prompts and outputs

## If You Need Project Context Fast

Read these in order:

1. `docs/PRD.md`
2. `README.md`
3. `backend/server.js`
4. `backend/collectors/syncListening.js`
5. `backend-python/handler.py`

