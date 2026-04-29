# Describe-a-Problem / New Case Intake Page

This page is the **main structured intake** into Frog Social.
It creates or updates a **Case**, captures a colony snapshot, and produces an AI-guided framing for next steps.

The layout is:

- Left column → user inputs (form).
- Right column → AI output (read-only panels).

---

## 0. Design Principle: Progressive Disclosure (Minimum First)

Describe a Problem uses a **progressive disclosure** model:

1. **Step 1** asks for the absolute minimum to create a useful case.
2. **Step 2+** nudges users to add more context over time.
3. Users are **never overwhelmed on first entry**.

### Step 1 — Minimum Entry (required to submit)

Only three things are required:

- **What's happening?** (free-text, 1–3 sentences)
- **Which colony/system?** (select from Colony Register if available, or type a name)
- **Post anonymously?** (checkbox, default off)

That's it. This creates a valid case with status "intake" and a timestamp.

### After submission — Gentle nudges

After the minimum case is created, the system shows:

- A confirmation: "Case created. You can add more details anytime."
- A short prompt card: "Adding a few more details helps the community help you faster."
- Optional expansion sections (collapsed by default) for:
  - Water snapshot
  - Husbandry snapshot
  - Recent changes
  - Feeding behavior video

Users can return to any case and add information incrementally. The AI summary updates as more fields are filled.

### Why this matters

Researcher feedback: users abandon complex intake forms. A single free-text entry with optional enrichment produces more cases, more participation, and better long-term data quality than a form that blocks submission until all fields are filled.

---

## 1. Route & naming

- Route should be something like: `/cases/new` or `/intake`.
- Global nav label: **"Describe a Problem"** or **"New Case"**.
- Dashboard tile: "Describe a problem" should link to this same route.

---

## 2. Left column – form sections & fields

### 2.0 Minimum entry (Step 1 — always visible)

- **What's happening?**
  - Large textarea (2–4 lines visible)
  - Placeholder: "Frogs stopped eating after water change" or "Redness on legs, started 3 days ago"
  - Required.

- **Which colony/system?**
  - Dropdown populated from user's Colony Register (if entries exist)
  - Or free-text field: "Colony / room / system name"
  - Required.

- **Post anonymously?**
  - Checkbox (default: off)
  - When checked, the case appears without the poster's identity in all views.

- **Submit button**: "Create Case"

This is the only content needed to submit. Everything below is optional enrichment.

---

### 2.1 Colony & system (optional enrichment — collapsed)

Section header: "Add colony details (optional)"

Fields (text or select, as appropriate):

- Institution / lab
- System type:
  - Recirculating rack / static tanks / flow-through / other
- Approximate number of frogs:
  - Numeric input or free text

If the user selected a colony from their Colony Register, these fields auto-populate from stored baseline.

---

### 2.2 Water snapshot (optional enrichment — collapsed)

Section header: "Add water info (optional)"

Capture the basics:

- Water temperature (°C)
- pH
- Conductivity or TDS (µS or ppm) – optional but encouraged
- Ammonia (NH₃/NH₄⁺) status – select:
  - Unknown / not tested
  - Within acceptable range
  - Elevated / concerning
- Water source – select:
  - RO / RO+DI
  - Treated city water
  - Well water
  - Mixed / not sure

Include a small helper/link text:

> "Need help with RO + buffering? See the ROBUFFER guide."

---

### 2.3 Recent changes (optional enrichment — collapsed)

Section header: "Any recent changes? (optional)"

Free-text textarea:

- "Recent changes (last 2–4 weeks)"

Used to capture:

- New water source.
- New salt mix.
- Equipment moves.
- New density.
- New feeding regime.
- Room renovation / changes in staff access.

AI should pay special attention to changes overlapping with onset of problems.

---

### 2.4 Husbandry snapshot (optional enrichment — collapsed)

Section header: **"How things look right now (optional)"**

Structured fields that map to the **13 Master Key** points:

- **Density in the tank**
  - `Low`, `Medium`, `High`, `Not sure`

- **Feeding vigor (last few feedings)**
  - `Low (slow, many frogs ignore food)`
  - `Medium (most respond, some slow)`
  - `High (rapid, competitive feeding)`
  - `Not sure`

- **Skin condition**
  - `Shiny / smooth`
  - `Dull`
  - `Lesions / redness`
  - `Not sure`

- **Room vibration / noise**
  - `Quiet`
  - `Some hum`
  - `Loud / constant`
  - `Not sure`

- **Flow & splash from inlets**
  - `Gentle, no splash`
  - `Splashy / noisy`
  - `Not sure`

- **Room disturbance**
  - `Rare (few entries per day)`
  - `Moderate`
  - `Constant traffic`
  - `Not sure`

- **pH meter calibration**
  - `Recently calibrated`
  - `Not calibrated recently`
  - `Not sure`

All of these fields should be part of the intake payload, typically grouped as a `husbandrySnapshot` object.

---

### 2.5 Feeding behavior video (optional enrichment — collapsed)

Section header: **"Feeding behavior video (optional)"**

#### 2.5.1 Upload field

- File input:
  - Label: `Upload short feeding clip (30–60 seconds)`
  - Accept: `video/mp4, video/quicktime, video/webm`
- Helper text:
  > "This helps compare your feeding response to internal reference videos. Start recording, add food, and keep filming until frogs either lose interest or food is gone."

Implementation note:
- For now, the frontend can just:
  - Trigger an upload handler (stubbed or simple POST).
  - Once the video is successfully uploaded, store the resulting `feedingVideoUrl` in the intake payload.

#### 2.5.2 Video metadata

Below the upload, add 3 small selects:

- **Time since last feeding**
  - `12–24 hours`
  - `24–48 hours`
  - `>48 hours`
  - `Not sure`

- **Density in this tank (for the video)**
  - `Low`
  - `Medium`
  - `High`
  - `Not sure`

- **Camera position**
  - `Top`
  - `Side`
  - `Angled`
  - `Not sure`

These values are saved in the case intake under something like `feedingVideoMeta`.

---

### 2.6 Free text problem description

Already captured in Step 1 (minimum entry). The user's initial description lives here. They may edit or expand it at any time.

---

## 3. Right column – AI output panels

Right-hand side is a stack of **read-only cards** that display AI output.

Panels:

1. **Situation summary**
2. **Husbandry focus areas**
3. **Suggested next steps**
4. **When to escalate**

Each panel:

- Uses the card styling from the UI style guide.
- Has a small header label (e.g., "Situation Summary") and then bullet/paragraph content.
- Updates progressively as the user adds more information (not just on first submit).

### 3.1 "Analyze with AI" button

For now, there should be a button:

- Label: `Analyze with AI`
- Behavior:
  - For MVP/stub: could be a no-op or call a dummy endpoint.
  - Long term: will send intake payload to backend AI endpoint and fill these panels with real output.
  - Re-runs automatically when new fields are added to an existing case.

The UI should be ready for asynchronous updates (loading state, then results).

---

## 4. Data & API expectations

The frontend should package the intake form into a payload along these lines:

```ts
interface IntakeFormPayload {
  // Step 1 — minimum (required)
  problemDescription: string;
  colonyId?: string;        // from Colony Register
  colonyName?: string;      // free-text fallback
  anonymous: boolean;

  // Optional enrichment (added later)
  institution?: string;
  systemType?: string;
  approxFrogCount?: string;

  waterTempC?: string;
  ph?: string;
  conductivity?: string;
  ammoniaStatus?: "unknown" | "ok" | "elevated";
  waterSource?: "ro" | "city" | "well" | "mixed" | "unknown";

  recentChanges?: string;

  husbandrySnapshot?: HusbandrySnapshot;
  feedingVideoMeta?: FeedingVideoMeta;
}

interface HusbandrySnapshot {
  densityBand?: "low" | "medium" | "high" | "unknown";
  feedingVigor?: "low" | "medium" | "high" | "unknown";
  skinState?: "shiny" | "dull" | "lesions" | "unknown";
  vibration?: "quiet" | "some_hum" | "loud" | "unknown";
  flow?: "gentle" | "splashy" | "unknown";
  disturbanceLevel?: "rare" | "moderate" | "constant" | "unknown";
  phMeterCalibrated?: "yes" | "no" | "unknown";
}

interface FeedingVideoMeta {
  feedingVideoUrl?: string;
  densityForVideo?: "low" | "medium" | "high" | "unknown";
  timeSinceLastFeeding?: "12_24h" | "24_48h" | "gt_48h" | "unknown";
  cameraPosition?: "top" | "side" | "angled" | "unknown";
}
```

---

## 5. Progressive Disclosure UX Rules

1. Step 1 must be completable in under 30 seconds.
2. Optional sections are collapsed by default — never auto-expanded.
3. Each optional section shows a brief "why this helps" hint when expanded.
4. Users can save and return — partial cases are valid.
5. The AI summary card updates each time new information is added.
6. No field is blocking except the Step 1 minimum.
7. Nudge frequency: one prompt after submission, then at most once per 24h per case.
