# Frog Social — HUB (Open This First)
## Core reference
- [Husbandry Framework](./HUSBANDRY_FRAMEWORK.md)
This framework defines the environmental and husbandry principles that guide Frog Social case analysis and recommendations.
## Source of Truth
- Frontend (canonical): site/ (static HTML)
- Backend (canonical): backend/ (TypeScript/Node)
- Archive (read-only): archive/

## Product Truths (Non-negotiables)
- Community-driven: discussion + follow-ups + confirmed outcomes.
- Running summaries + case histories preserve community memory.
- Avoid user-facing language implying machine authority (“AI analysis”, “generated”, etc.).
- Husbandry-first framing; outcomes + context outrank pathogen panic.
- Later: reuse the same community-memory engine for LabWorks.

## When Returning
1) Open this HUB
2) Open docs/NEXT_STEPS.md (topmost dated section)
3) Work the checklist
4) Add a log entry when you stop

## Log (newest at top)
### 2026-02-23
- Backend thread endpoints confirmed working: /api/threads/:threadId/messages and /api/threads/:threadId/recap
- POST /api/messages returns threadId and messageId
- Next session starts from docs/NEXT_STEPS.md (start-of-session workflow), then choose next module (persistence vs guide ingestion vs constrained framing).

### 2026-02-22
- Confirmed canonical frontend is site/ (static HTML). Archive has extract.html only.
