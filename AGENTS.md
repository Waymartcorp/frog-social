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

### Minimum threshold for formal case creation
At minimum:
- a clear problem statement
- plus at least one meaningful suggestion, comment, or response

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

### Required Social behavior
- concise case summary on the right
- live Emerging Threads on the right
- linked summaries/cases from chat
- clean layout
- less repetitive text
- less generic AI language
- more field-note style
- better visual hierarchy

### Social page layout intent
Primary structure:
- **Left side** = live discussion feed
- **Right side** = context rail

Right rail should support:
1. **Active Case Summary**
2. **Emerging Threads**
3. **Linked Cases / Summaries**

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

## 8. Outer-World / Real-World Readiness Rules

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

They are distinct product layers and must remain distinct unless explicitly redesigned.