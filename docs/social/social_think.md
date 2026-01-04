# Frog Social – Social Stream & AI Console ("Social Aspect" Think Doc)

## Overall concept

The Social page is the beating heart of Frog Social.

It is a **Slack-like, lab-serious conversation space** where:
- Anyone signed in can post problems and observations.
- The AI agent sits alongside the conversation, not replacing it.
- The AI:
  1. Summarizes ongoing threads.
  2. Guides people toward solutions based on our husbandry troubleshooting model.
  3. Builds and updates case histories.
  4. Follows up with users to capture resolution and outcomes.

Over time, this space will accumulate:
- Problem → recommendations → resolution chains.
- Feeding-response and skin-health assessments.
- Signals we can later correlate with device telemetry and proprietary algorithms.

---

## Goals of the Social page

1. **Be the default place people go when “something feels wrong.”**
2. **Turn messy chat into structured knowledge** (case histories, best practices).
3. **Embed our 13-point husbandry model** into every interaction:
   - Water source, buffering, pH, GH/KH, temp.
   - Density + feeding response.
   - Vibration, flow, light, disturbance.
   - Skin condition, lesions, PVC fighting, etc.
4. **Record and learn from outcomes.**
   - For each thread, we want: *problem → guidance → resolution* captured.
5. **Eventually integrate device-based feeding + “frog look” metrics** into the same flow.
   - Quantitative assessment of feeding response (video-based).
   - Quantitative assessment of skin shine and texture.

---

## Layout (first version)

Route: `/social`

Three main columns:

1. **Left column – Threads list**
   - Shows all threads relevant to the user:
     - Title / short problem summary.
     - Status: `open`, `needs follow-up`, `resolved`.
     - Last updated timestamp.
   - Filters:
     - Problem type (not eating, skin, mortality, breeding, water quality, system build).
     - Facility (if multi-facility).
     - My threads vs all.

2. **Center column – Conversation**
   - Chronological messages (like Slack).
   - Each message can include:
     - Free text (what happened).
     - Selected or inferred problem type.
     - Attached telemetry snapshot (optional but encouraged).
   - At the bottom:
     - Message composer with:
       - Text box.
       - Quick telemetry fields (density band, feeding response, water source, etc.).
       - Option to attach video (for feeding behavior) or images (skin).

3. **Right column – AI Side Bar (Agent)**
   - Always showing live information for the selected thread:
     1. **Short summary** of the situation (plain, lab-serious language).
     2. **13-point husbandry checklist** with colored status:
        - Green / Amber / Red for each item.
        - One-sentence explanation and recommendation per red item.
     3. **Steering recommendations** (2–5 suggested next actions).
     4. **Case history snapshot**:
        - Root question / main problem.
        - Key telemetry highlights.
        - What has been tried so far.
     5. **Follow-up plan**:
        - “What we will ask the user later.”
        - A simple “follow-up due” indicator.

---

## How the AI should behave

### When someone posts a new message

For each new message (with telemetry):

1. **Store the raw message** in the thread.
2. **Update the telemetry picture** for the thread:
   - Water source / buffering / pH / GH / KH / temp.
   - Density band, feeding response.
   - Skin condition.
   - Vibration, flow, light, disturbance.
3. **Evaluate the husbandry state** using our internal logic (13-point model):
   - This should produce structured signals like:
     - `"water_source": status, explanation, recommendation`
     - `"density_feeding": status, explanation, recommendation`
4. **Ask the LLM to:**
   - Generate a reply message in the thread (center column) that:
     - References the key husbandry signals.
     - Avoids panic / pathogen obsession.
     - Offers concrete, prioritized steps.
   - Update:
     - A short summary.
     - The checklist item statuses and text.
     - A small set of next-step recommendations.

### Case-building and follow-up

- Each thread has:
  - `root_question`: what the original problem was.
  - `case_history`: a timeline of key decisions and changes.
  - `resolution`: free text + a few structured fields once we know the outcome.

- The AI should:
  - Keep track of what recommendations were given.
  - After some time or when user returns, **ask explicitly**:
    - “Did X help? What changed?”
  - When the user reports outcomes, we mark the thread as resolved and fill in resolution info.

This converts chat into:
- Problem → recommended actions → actual outcome.
- Usable for training and future guidance.

---

## Feeding behavior & skin “technological assessment”

Current phase (before device):

- We will:
  - Let users upload short feeding videos (High / Medium / Low density).
  - Ask them to tag:
    - Density band: low / medium / high.
    - Observed feeding response: high / medium / low.
  - Ask them for simple skin notes:
    - Shiny / dull / lesions, maybe with example reference images.

- The AI + rules will:
  - Combine density + feeding response + skin notes with water and environment.
  - Still treat:
    - Feeding behavior and skin shine as primary **positive health indicators**.
    - But not in isolation (e.g., feeding can look decent while micronutrient or vibration issues still stress frogs).

Longer term (device phase):

- We want:
  - Device-based quantitative measurements of feeding and skin.
  - These will feed into the same thread telemetry as “trusted metrics.”
- Important:
  - Visual assessment by humans is inherently noisy.
  - The platform must be able to say:
    - “We think feeding and skin look OK, but water hardness or vibration are still problematic.”

---

## Important design principles

- **Husbandry first, pathogens second.**
  - Default assumption: problems are driven by water, density, feeding, environment.
  - Pathogens are *opportunistic* and secondary.

- **Respect for nuance.**
  - Frogs can be eating “ok” while still being stressed by:
    - Poor buffering / hardness.
    - Vibration or turbulence.
    - Chronic slight pH drift.
  - The system must consider and rank multiple factors, not only feeding and skin.

- **No “same answer every time” slop.**
  - The agent must not say “increase density” by default on every problem.
  - It must balance:
    - Feeding response,
    - Skin,
    - Water / environment,
    - Recent changes.

- **Serious, lab-style tone.**
  - No cute language.
  - Clear, directive recommendations:
    - “Today: adjust X.”
    - “Over the next week: monitor Y.”
    - “If Z occurs, escalate to [vet / expert contact].”

---

## Open questions / to refine

- How aggressively should the agent push toward ROBUFFER vs. mixed city/RO water?
- How do we handle conflicting signals (good feeding but chronic skin dullness + mortalities)?
- How often should follow-up prompts be sent, and by what channel (email, in-app notification, both)?
- What minimal telemetry fields are *mandatory* for meaningful guidance?

These can be filled in as we build the first version.
