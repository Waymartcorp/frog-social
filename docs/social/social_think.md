# Frog Social – Social Layer & Learning Surfaces

Frog Social is more than a chat: it is a **husbandry console with memory**, built around three main “surfaces” that all talk to the same case model.

---

## 1. Core surfaces

### 1.1 Social Feed

- A Slack-like stream of messages where:
  - Users describe issues, observations, and experiments.
  - They can attach images / videos (especially feeding behavior).
  - They can link posts to existing **Cases**.

- The right-hand side is an **AI assistant panel** that:
  - Summarizes the current discussion.
  - Highlights husbandry levers (density, water, ROBUFFER, flow, vibration, etc.).
  - Suggests next steps in a non-diagnostic way.
  - Points users back toward good intake (Describe a Problem) and Case History.

### 1.2 Describe a Problem (New Case Intake)

- Structured intake page for new situations.
- Captures:
  - Facility/colony info.
  - Water & system snapshot.
  - Husbandry snapshot (13 points).
  - Optional feeding video + metadata.
- Outputs a **initial AI summary**:
  - Situation summary.
  - Key husbandry focus areas.
  - Suggested steps.
  - When to escalate.

This page **creates or updates a Case** in the backend.

### 1.3 Case History & Resolution

- List of cases with:
  - Initial intake summary.
  - Linked social discussion snippets.
  - Resolution notes.
  - Follow-up outcome.

Users can:

- Mark a case as **resolved**.
- Add a short resolution summary.
- Log whether a follow-up was done and what happened.

This creates a **feedback loop** the AI can learn from.

---

## 2. Key entities

We conceptually have:

- **Facility / System**
  - A lab, room, or rack – something that is relatively stable in time.
  - Stores baseline config (water source, system type, density policy, etc.).

- **Case**
  - A discrete problem or question:
    - “Frogs not eating after water change”
    - “Green water in static tanks”
  - Has:
    - Intake snapshot (from Describe a Problem).
    - Status: open / resolved / needs follow-up.
    - Resolution summary.
    - Follow-up notes.

- **Thread / Social Message**
  - A conversational thread stored under Social.
  - Messages belong to threads; threads can be linked to one or more Cases.
  - Messages can include:
    - Text.
    - Media references (videos, images).
    - Quick husbandry tags.

- **User / Profile**
  - Name, institution, role.
  - Allows attribution of cases and social posts.

Backends can store these using simple in-memory or DB structures; the important part is the **relationships**:
- Case ↔ Intake
- Case ↔ Social thread
- Case ↔ Resolution / follow-up

---

## 3. AI roles in the social layer

The AI has three primary jobs:

### 3.1 Intake summarizer

In Describe a Problem:

- Read all structured fields + free text.
- Use the **Husbandry Master Key** (13 points) as the mental checklist.
- Produce:
  - One-paragraph situation summary.
  - List of 3–7 husbandry focus areas (ranking the most likely).
  - 3–5 concrete next steps that are:
    - Actionable.
    - Logically justified by the inputs.
  - “When to escalate” section:
    - When to involve vets, institutional staff, etc.

This goes on the right-hand “Intake Summary” panel.

### 3.2 Social co-pilot

On the Social feed:

- Watch the evolving thread for a case.
- Summarize every X messages:
  - “Here’s what has happened so far.”
  - “Here’s what has been tried.”
  - “Here are the remaining unknowns.”
- Suggest:
  - Additional husbandry data to collect.
  - Experiments to run (e.g. test tank with increased density).
  - Which Master Key points are still unchecked.

Importantly:

- It does **not** replace peer-to-peer discussion.
- It acts as a “steady, calm husbandry expert” in the background.

### 3.3 Resolution & learning

When a case is resolved:

- The user (or a moderator) writes a brief resolution:
  - “Increased density, adjusted ROBUFFER, calmed vibration; appetite returned.”
- Optionally logs:
  - Time to resolution.
  - Whether frogs returned to spawning, gained body condition, etc.

AI can then:

- Store: (inputs → recommendations → actual resolution outcome).
- Use this for future patterning:
  - e.g., “Most similar cases responded to density increase + buffered water adjustments.”

This is **not training data in code here**, but the data model and UI should assume this is where things are headed.

---

## 4. Interaction between surfaces

Key flows:

1. **Describe → Social**
   - A new intake can spin up an associated social thread automatically.
   - The intake summary shows in the social sidebar.

2. **Social → Case**
   - Social messages can be linked to an existing case.
   - If a conversation starts in Social first, users can later “promote” it into a Case and fill in the intake form.

3. **Case History → Social/Intake**
   - Case History entries should show:
     - Intake snapshot.
     - Links to the associated social thread.
     - Resolution & follow-up.
   - From Case History, users can:
     - Re-open a case.
     - Start a new thread referencing it.
     - Clone it as a template for a similar scenario.

---

## 5. Tone & behavior guidelines for AI in the social layer

The assistant:

- Is **calm, non-panicky, and non-judgmental**.
- Does not scold users for imperfect setups; it helps them improve.
- Avoids diagnosing specific diseases; instead, it:
  - Highlights husbandry factors (water, density, vibration, pH, etc.).
  - Encourages sensible next steps and vet involvement when appropriate.
- Emphasizes **performance-based health**:
  - Appetite, body condition, skin, spawning success.
  - Not just lab numbers or pathogen tests.

This document guides **how the Social page and related APIs should evolve**:
- Two-column layout (conversation + AI).
- Linking to Cases.
- Making resolution and follow-up first-class, so the system becomes smarter over time.
