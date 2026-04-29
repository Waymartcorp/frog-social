# Frog Social — Next Steps (Newest at Top)
# NEXT_STEPS.md

Operational checklist and implementation backlog only.

Frog Social behavior, information architecture, learning model, case rules, and knowledge hierarchy are defined in:

- `docs/FROG_SOCIAL_INFORMATION_ECOSYSTEM.md`
- `docs/HUSBANDRY_FRAMEWORK.md`

If this file conflicts with those files, those files win.
- Added canonical docs/HUSBANDRY_FRAMEWORK.md and linked it from 00_HUB.md.
> Rule: Add a new dated section at the top when restarting. Never delete prior sections.

---

## Next Steps (as of 2026-04-29)

### Researcher Feedback Integration — Implementation Checklist

#### A) ToS / Content Protection
- [ ] Implement ToS acceptance on account creation (reference `docs/TERMS_AND_PRIVACY.md`)
- [ ] Add content-use protection notice visible in UI footer or settings
- [ ] Enforce login-gating on all contribution endpoints
- [ ] Block public search engine indexing (robots.txt / meta tags)

#### B) Anonymity / Privacy Controls
- [ ] Add "Post anonymously" toggle to Social post composer
- [ ] Add "Post anonymously" checkbox to Describe a Problem (Step 1)
- [ ] Implement coded identity option in account creation/settings
- [ ] Colony Register: default all records to private
- [ ] Backend: store real identity but respect anonymous display rules

#### C) Describe a Problem — Progressive Disclosure
- [ ] Rebuild intake UI as Step 1 (minimum) + collapsed optional sections
- [ ] Step 1 fields: problem description + colony selector + anonymous toggle
- [ ] After-submit nudge card: "Add more details"
- [ ] Collapse all enrichment sections by default
- [ ] Allow save-and-return (partial cases are valid)
- [ ] AI summary updates on each field addition

#### D) Colony Register + Management
- [ ] Colony list view (private to user)
- [ ] Colony create form (minimum: name only)
- [ ] Colony detail view with tabs: Baseline / Event Log / Status / Linked Cases / Export
- [ ] Quick-add event inline form
- [ ] Status/recovery indicator with history
- [ ] Colony selector in Describe a Problem (auto-populates baseline)
- [ ] CSV export of colony record
- [ ] Authorized group sharing (optional, later)

#### E) Priority Order for Implementation
1. Login + coded identity + ToS acceptance
2. Anonymous posting (social + cases)
3. Describe a Problem progressive disclosure rebuild
4. Colony Register + Management (private, lightweight)
5. CSV export
6. Colony → Case linkage and context auto-population

---

## Next Steps (as of 2026-02-23)

### 0) Start-of-session workflow (do this first)
1) Open:
   - docs/00_HUB.md
   - docs/NEXT_STEPS.md
2) Repo status:
   - git status
3) Start backend (from repo root):
   - cd backend
   - npm run dev

### 1) Verify API is live (new terminal)
- curl http://localhost:4000/api/health

### 2) Smoke test thread recap pipeline (known thread id)
- curl -X POST http://localhost:4000/api/messages \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo","threadId":"smoke-test","content":"Temp 21C, RO water buffered, conductivity 900 uS/cm. Frogs not feeding."}'

- curl http://localhost:4000/api/threads/smoke-test/messages
- curl http://localhost:4000/api/threads/smoke-test/recap

Expected:
- messages returns an array with the post
- recap returns recapBullets containing the message and missingInfoQuestions narrowed to remaining gaps

### 3) Confirm “source of truth” is still correct
- Frontend canonical: site/
- Backend canonical: backend/
- Archive read-only: archive/

### 4) Decide the next module to implement (pick ONE)
A) Persistence so community memory survives restarts (JSON or SQLite)
B) 50% MD guide ingestion (husbandry guide cards + citations)
C) 20% LLM framing (recap phrasing + draft structuring) constrained to cite guide cards/resolved cases

### 5) Next coding target (if choosing A or B first)
A) Persistence:
- persist messages + cases + thread→case mapping
- reload on server start
B) Guide ingestion:
- create docs/husbandry-guide.md
- backend endpoint to reindex into guide cards
- recap/guidance endpoint can cite guide card IDs

### 6) End-of-session
- Add a short entry to docs/00_HUB.md Log with what changed and what’s next

---

## Next Steps (as of 2026-02-22)

### A) Repo truth + guardrails
- [ ] Canonical frontend is site/ (static HTML) — confirmed.
- [ ] Canonical backend is backend/ (TS/Node) — confirmed.
- [ ] Archive is archive/ read-only (DO_NOT_EDIT.md).

### B) Remove “AI analysis” + machine-authority wording (highest priority)
Run:
- rg -n -i "ai analysis|ai\\b|llm|generated|the system recommends|automated diagnosis" site
Replace with:
- “Community recap”
- “Similar cases”
- “What worked for others”
- “Checks to consider”
- “Follow-up requested”

### C) Login plan (phase 1)
- [ ] Choose auth approach (simple email login/magic link or lightweight accounts).
- [ ] Gate posting/commenting/outcomes behind login.
- [ ] Add steward/mod role (retag/anonymize/highlight).

### D) Running summary → case history builder
- [ ] Add “Sources” links under recap bullets (each point links to posts).
- [ ] Pipeline: discussion → draft → user/steward confirmation → published case history.
- [ ] Keep wording “recap/consolidation,” not “generated analysis.”

### E) Outcome loop + incentives
- [ ] Follow-up prompts: 24h / 72h / 7d.
- [ ] “Resolved” requires: action tried + outcome + short resolution summary.
- [ ] Reputation rewards closure + confirmed outcomes.

### F) Seed case histories
- [ ] Add starter cases (named only with permission; otherwise anonymize):
  - Kristian Franze
  - Germany contributor
  - Coral Zhou
  - Dan Bucholtz
  - Jennifer Landino

### G) Later: LabWorks
- [ ] Reuse the same community-memory engine for workflow records + validated procedures.

---

## Next Steps (archive — prior)
- (Paste older lists below as they accumulate)
