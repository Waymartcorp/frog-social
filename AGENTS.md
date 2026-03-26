# AGENTS.md

## Frog Social: Product Contract

This repo supports Frog Social. The agent must preserve the following product rules and operating constraints.

---

## 1. Core Product Identity

Frog Social is not a generic AI forum and not a simple chat app.

It is a live husbandry/problem-discussion system that:
- captures real discussion,
- interprets that discussion,
- maintains a running summary,
- detects an emerging thread,
- links relevant prior cases,
- and, once a threshold is met, creates a formal structured case in Case History.

The product must preserve a clear distinction between:
- live discussion,
- live interpretation,
- **GENERAL KNOWLEDGE** (authoritative synthesis layer — see below),
- emerging thread,
- linked prior cases,
- and archived formal cases.

---

## 2. Non-Negotiable Product Rules

1. **Social is a live discussion surface, not the archive.**
2. **Case History is the archive of formalized cases.**
3. **Describe a Problem can create or update a case.**
4. **Chat can absolutely create a case once threshold is met.**
5. **Chat itself is not the case and must not be pushed to the archive as the case record.**
6. **The archived case must be structured, concise, and signal-focused — not a transcript.**
7. **Do not invent case IDs, case numbers, saved summaries, stored links, or persistence state.**
8. **Do not claim any flow works unless it was directly tested.**
9. **Prior cases may be shown during chat only if grounded in actual saved state.**
10. **Persistence is not considered proven unless it survives reload/reopen in the relevant environment.**
11. **UI language must be concise, field-note style, and avoid generic AI prose.**
12. **Do not let formatting changes silently alter persistence or case logic.**

### GENERAL KNOWLEDGE (authoritative layer)

**GENERAL KNOWLEDGE** is the product term for anything **deduced or strongly inferred** and presented as stable, reference-grade guidance — not raw chat.

It may draw from, in combination:
- **Posts** and **chat / thread history** (what was actually said, synthesized),
- **Case history** (admitted cases, summaries, patterns the system legitimately recalls),
- The **husbandry knowledge base** (framework docs),
- **LLM synthesis** where the model connects dots that are **explicitly grounded** in the above (never invented facts).

It is intentionally **subtle and authoritative**: when used properly it shapes how people think without pretending to be a transcript, and it **builds trust** by separating “what people said” from “what the system reasonably treats as known or well-supported here.”

- **User-visible label:** the Live Chat Summary row and recap prefix use **Knowledge base** for this content (signals assertions backed by framework, cases, or grounded synthesis — e.g. feeding-behavior links to density).
- Reserve this layer for **GENERAL KNOWLEDGE** (the concept) / **Knowledge base** (the UI term) — not generic filler or ungrounded speculation.

---

## 3. Correct Chat / Case Creation Logic

### Chat absolutely can create a case.

The live dynamics of chat are:

1. **Discussion**
   - users log in and state a problem
   - others respond

2. **Interpretation of the discussion**
   - the system picks up cues from the conversation

3. **Running summary**
   - the system maintains a live parallel summary of the discussion
   - **Knowledge base** (row) carries **GENERAL KNOWLEDGE**-class content: deduced / strongly inferred from posts, thread history, case recall, husbandry framework, and grounded LLM synthesis (see §2).

4. **Emerging thread**
   - this is the live developing issue
   - it is triggered by:
     - user comments
     - system knowledge
     - past cases

5. **Links to matching stored cases**
   - when the system recognizes similarity to prior cases, it shows:
     - case link
     - case number
     - date
   - these appear alongside the emerging thread

6. **Threshold to formal case**
   - once the live discussion passes threshold, it becomes a formal case

### Case creation path (code-enforced)

Cases are created from **topic segments**, not from the whole chat blob.

1. `handleNewMessage` receives a new post.
2. First: try to route the message to an existing open segment case (follow-up window: 10 days).
3. If no existing case: run `promoteEmergingThreadsToCases` which:
   a. Segments the thread by strict topic (`segmentThreadByStrictTopic`)
   b. For each segment, evaluates maturity (`evaluateSegmentMaturity`, threshold >= 4)
   c. Maturity signals: domain specificity, meaningful post count, distinct participants, KB/guideline support, related prior cases
   d. Mature segments become formal cases with case number, date, structured summary
4. Fallback: if segment promotion creates nothing (single topic, insufficient maturity), create a single-topic case from the thread.

### Minimum threshold for formal case creation
At minimum:
- a clear problem statement
- plus at least one meaningful suggestion, comment, or response
- maturity score >= 4 (from: domain specificity, post depth, KB support, related cases, participants)

### When threshold is crossed, the system must:
- create a structured case record
- assign a case number
- assign a date
- push the structured case into Case History / Case Memory
- preserve linkage between:
  - live discussion
  - running summary
  - emerging thread
  - matching prior cases
  - formal stored case

### Critical boundary
**Chat can create a case, but chat is not the case.**

The raw chat thread:
- may be linked to the case
- may remain visible in Social
- may inform the summary and case formation

But the raw chat thread:
- is **not** the formal archived case
- must **not** be stored as the canonical case record
- must **not** be dumped into Case History as a transcript

Only the structured case is pushed to the archive.

---

## 4. Social Page Product Rules

The Social page is a live, legible, field-note-style environment.
**It is not the archive.** It must remain lightweight and current.

### State model layers (do not collapse together)

| Layer | Lifetime | Visible on Social | Storage |
|---|---|---|---|
| Social posts | Permanent | Always (feed) | messages.json |
| Emerging threads | Temporary | Recent only (max 3) | Computed per request, not stored separately |
| Topic track cards | Temporary | Max 2 active | Derived from formal cases, capped in UI |
| Related/recalled cases | Temporary, age-out | Max 2 | Computed per request, score-penalized after 3 days |
| Linked cases | Temporary | Max 4 | Computed from thread references |
| Formal cases (Case History) | Permanent | Not directly — referenced via cards | cases.json |

### Retention rules (code-enforced, not LLM-judged)

- **Emerging threads**: max 3 shown, 2-hour window for local fallback. Note in UI: "Recent only — older threads move to Case History."
- **Topic track cards**: max 2 shown on social page (sorted: active first, then by recency).
- **Related/recalled cases**: max 2 shown. Backend applies age penalty: cases >3 days old get 50% score reduction, >7 days get 75% reduction. They naturally drop off the social page as they age.
- **Linked cases**: max 4 shown, sorted by recency.
- **Follow-up window**: 10 days. New relevant comments update an existing case within this window instead of creating duplicates. After 10 days, a new case is created.

### Required Social behavior
- concise case summary on the right
- live Emerging Threads on the right (max 3, recent only)
- linked summaries/cases from chat (max 4)
- related/recalled cases (max 2, age out after ~3 days)
- topic track cards (max 2 active)
- clean layout
- less repetitive text
- less generic AI language
- more field-note style
- better visual hierarchy

### Social page layout intent
Primary structure:
- **Left side** = live discussion feed
- **Right side** = context rail

Right rail panels (in order):
1. **Social Session** — session metadata (thread name, post count, date range). Not a case view.
2. **Current Cases** — cases created from mature emerging topics in this session (max 2). These are formal cases, not topic labels.
3. **Emerging Threads** — temporary topic clusters from recent posts (max 3). Mature threads become cases above.
4. **Related Cases** — prior archive matches recalled by similarity (max 2, age-out after ~3 days). NOT current session cases.

Removed:
- "Linked Cases / Summaries" — was redundant with Current Cases and Related Cases.

### Tone and style rules
All UI text should feel like:
- field notes
- lab notes
- quick peer exchange
- observed conditions and responses

Avoid:
- verbose AI paragraphs
- generic assistant phrasing
- repeated explanations
- over-polished prose
- medical/legal-style overstatement

### Preferred case language
Cases and summaries should read like:
- concise signal
- structured observations
- minimal but informative notes

Not:
- essays
- transcripts
- padded summaries

---

## 5. Archive / Case History Rules

Case History is the archive of formalized cases.

**Admission gate:** A case **record** can start from **one** meaningful Social post (`candidate` — visible in Social / API, not the main archive flood). **`admitted`** (shown in Case History default list) requires **≥2 meaningful posts**, so single posts or long auto-summaries alone cannot promote noise into the archive. **Extra admission path:** ≥2 meaningful posts plus strong **recurrence** (≥2 similar **admitted** prior cases in recall) **or** ≥1 similar admitted case **and** ≥2 **distinct participants** in the thread — still capped by the 2-post floor.

### Case worthiness (validity) signals

These **inform** promotion and user trust; they are **not** a substitute for grounded posts.

1. **Prior discussion / recurrence** — Has this theme (or close variants) shown up in stored cases or repeated threads? Higher recurrence supports treating the topic as institutionally useful, not a one-off typo.
2. **Shared problem scale** — Does the thread read as a narrow local nuance vs something many facilities could hit? Ground only in what posters said; never invent census or “how many labs.”
3. **Analogous contexts** — Clear parallels the LLM can justify (e.g. ammonia / biofilter loading in other recirc systems such as finfish RAS) to connect dots and suggest transferable monitoring — **only** when relevant; no free-association.

Implementation stores LLM `caseWorthiness` on the case record and passes **admitted** case titles/summaries into the summarizer as context. Recall-based counts feed the extra admission branch above.

Case History should contain:
- case number
- date
- concise structured case record
- any intentionally linked summary metadata
- optional link back to source discussion if designed that way

Case History should not contain:
- raw transcript dumps
- speculative cases not actually created
- fake or placeholder case numbers
- UI-only derived content that is not saved

Case History must remain distinct from:
- Social feed
- transient discussion state
- temporary summaries that have not been persisted

---

## 6. Persistence Rules

Persistence is one of the highest priority concerns.

### Do not assume persistence is working.
It must be explicitly tested.

The agent must verify:
- does a Social post create/update a case in Case History?
- does a Describe a Problem submission create/update a case in Case History?
- does leaving and returning preserve:
  - social posts
  - summaries
  - linked cases
  - case history entries

### Persistence categories that must be distinguished
Every audit must distinguish whether behavior is:
- local only
- transient in-memory
- server-persistent
- account-backed
- verified after reload
- verified across sessions
- unverified in deployed environment

### Critical honesty rule
Do not describe expected behavior as confirmed behavior.

If something was not directly tested, label it:
- **UNVERIFIED**
or
- **ASSUMED**
or
- **BROKEN**
as appropriate.

---

## 7. Current Priority Order

Current work should be prioritized in this order:

1. **Verify persistence and shared wiring**
   - Social -> Case History
   - Describe a Problem -> Case History
   - reload/reopen persistence for posts, summaries, linked cases, and Case History

2. **Clean up Social page formatting and hierarchy**
   - make it more legible
   - stronger right rail
   - field-note style
   - less repetition and generic AI language

3. **Only after verification, unify case creation/update behavior**

4. **Produce a wiring audit**
   - what Social saves
   - what Describe a Problem saves
   - what Case History reads
   - what survives reload
   - what is local/transient only
   - what UI surfaces are out of sync

5. **Track adjacent real-world readiness**
   - whether AI is connected to the outer world where expected
   - whether the system is only local/demo or truly account-backed
   - what remains unproven until login + TOS + deployed testing exist

---

## 8. Environment Truth Rules

### Canonical production environments
- **https://www.frogsocial.org**
- **https://frog-social.vercel.app**

Production is the truth environment. All verification must target production unless explicitly debugging local-only behavior.

### Localhost rules
- Do NOT treat localhost as the primary truth environment.
- Do NOT present localhost results as if they prove production behavior.
- Only use localhost if explicitly debugging local-only behavior, and label all localhost results clearly as **LOCAL-ONLY**.
- Deploy path: `git push origin main` → Vercel GitHub auto-deploy → production.

### Real-world readiness
Even if local logic appears to work, the system is not fully proven until real-world conditions are addressed.

The agent must keep track of:
- whether AI is actually connected to the outer world where expected
- whether the product has login/auth
- whether Terms of Service / user policy gating exists
- whether persistence is truly account-backed
- whether deployed behavior has been tested after leaving/reloading/returning

Do not overstate product readiness if behavior is only:
- local
- demo-only
- session-only
- dev-server-only

---

## 9. Agent Behavior Rules

For every non-trivial task:

1. Inspect relevant files first.
2. State which files were inspected.
3. State which files will be changed before or while making edits.
4. Separate UI work from persistence work unless explicitly instructed to combine them.
5. Do not silently change schema, persistence behavior, or case logic during a formatting-only task.
6. Do not silently change UI layout during a persistence-only task.
7. Prefer explicit uncertainty over fabricated certainty.
8. Preserve product semantics over superficial completion.
9. Never hallucinate records, saved state, case IDs, archive entries, summaries, or connectivity status.
10. Every report must clearly separate:
   - VERIFIED
   - UNVERIFIED
   - BROKEN
   - ASSUMPTIONS

---

## 10. Scope Discipline Rules

### For formatting-only tasks
Allowed:
- layout
- hierarchy
- labels
- rendering structure
- visual clarity
- concise wording

Not allowed unless explicitly requested:
- schema changes
- persistence changes
- backend route changes
- case creation logic changes
- LLM logic changes

### For persistence-verification tasks
Allowed:
- inspect data flow
- trace writes/reads
- test reload behavior
- fix clearly identified broken save/read paths if requested

Not allowed unless explicitly requested:
- broad UI redesign
- major product rewrites
- advanced AI behavior changes

### For logic-unification tasks
Allowed:
- align case creation/update behavior across Social, chat, and Describe a Problem
- ensure archive boundaries are preserved
- reduce inconsistent save behavior

Must preserve:
- chat can create case
- chat is not the archived case
- Case History stores formal structured cases only

---

## 11. Standard Verification Matrix

When auditing behavior, use a matrix like this and mark each row honestly.

| Surface / Flow | Creates? | Updates? | Reads? | Survives reload? | Local only or persisted? | Notes |
|---|---|---|---|---|---|---|
| Social post |  |  |  |  |  |  |
| Running summary |  |  |  |  |  |  |
| Emerging thread |  |  |  |  |  |  |
| Linked prior case |  |  |  |  |  |  |
| Chat threshold -> formal case |  |  |  |  |  |  |
| Describe a Problem submission |  |  |  |  |  |  |
| Case History archive read |  |  |  |  |  |  |
| Chat recall of prior cases |  |  |  |  |  |  |

If any row is not directly tested, say so.

---

## 12. Required Reporting Format

At the end of each non-trivial task, return exactly these sections:

### Files inspected
- list each inspected file

### Files changed
- list each changed file

### What changed
- concise description of actual changes

### Direct tests run
- what was actually tested

### VERIFIED
- what is directly confirmed

### UNVERIFIED
- what has not been proven

### BROKEN / STILL WRONG
- what is failing, out of sync, or suspicious

### ASSUMPTIONS
- anything inferred but not yet proven

### Next recommended step
- the next highest-leverage step

---

## 13. Product Language Guardrail

Use concise, grounded language.

Prefer:
- “observed”
- “reported”
- “linked”
- “emerging thread”
- “case created”
- “not yet verified”

Avoid:
- “it seems that...”
- “this could potentially indicate...”
- “the AI believes...”
- generic padded assistant prose
- overstated certainty

Cases should read like field notes, not essays.

---

## 14. Final Safety Against Drift

If there is any conflict between superficial convenience and product correctness:

Choose product correctness.

If there is any ambiguity between:
- live discussion
- emerging thread
- running summary
- formal case
- archive record

Do not collapse them together.

They are distinct product layers and must remain distinct unless explicitly redesigned.l====