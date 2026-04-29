# Frog Social — HUB (Open This First)

## Source-of-truth docs
- `docs/FROG_SOCIAL_INFORMATION_ECOSYSTEM.md`
- `docs/HUSBANDRY_FRAMEWORK.md`

## Supporting specs
- `docs/social/DESCRIBE_A_PROBLEM_SPEC.md`
- `docs/social/COLONY_REGISTER_SPEC.md`
- `docs/social/FROG_SOCIAL_AI_INTAKE_TEMPLATE.md`
- `docs/social/SOCIAL_SURFACES_REFERENCE.md`
- `docs/ui/frog_social_style_guide.md`
- `docs/TERMS_AND_PRIVACY.md`

## Operational file
- `docs/NEXT_STEPS.md`

## Code truth
- Frontend (canonical): `site/`
- Backend (canonical): `backend/`
- Archive (read-only): `archive/`

## How to resume work
1. Open this file
2. Open `docs/FROG_SOCIAL_INFORMATION_ECOSYSTEM.md`
3. Open `docs/HUSBANDRY_FRAMEWORK.md`
4. Open `docs/NEXT_STEPS.md`
5. Continue from the current checklist
6. Add a short log entry when stopping

## Important rule
If older Frog Social notes conflict with:
- `docs/FROG_SOCIAL_INFORMATION_ECOSYSTEM.md`
- `docs/HUSBANDRY_FRAMEWORK.md`

those files win.

## Log (newest at top)

### 2026-04-29
- Integrated researcher feedback: ToS/content-use protection, anonymity/privacy controls, progressive disclosure for Describe a Problem, Colony Register + Management
- Added `docs/TERMS_AND_PRIVACY.md` (content protection + privacy policy)
- Added `docs/social/COLONY_REGISTER_SPEC.md` (colony register + management spec)
- Rewrote `docs/social/DESCRIBE_A_PROBLEM_SPEC.md` with progressive disclosure model
- Updated `docs/FROG_SOCIAL_INFORMATION_ECOSYSTEM.md` sections 23–27 with new non-negotiables and build priorities

### 2026-02-23
- Backend thread endpoints confirmed working: `/api/threads/:threadId/messages` and `/api/threads/:threadId/recap`
- `POST /api/messages` returns `threadId` and `messageId`
- Next session starts from `docs/NEXT_STEPS.md`, then choose next module

### 2026-02-22
- Confirmed canonical frontend is `site/` (static HTML)
- Confirmed canonical backend is `backend/` (TypeScript/Node)
- Archive remains read-only