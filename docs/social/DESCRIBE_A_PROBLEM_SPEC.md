# Describe-a-Problem / New Case Intake Page

This page is the **main structured intake** into Frog Social.  
It creates or updates a **Case**, captures a colony snapshot, and produces an AI-guided framing for next steps.

The layout is:

- Left column → user inputs (form).
- Right column → AI output (read-only panels).

---

## 1. Route & naming

- Route should be something like: `/cases/new` or `/intake`.
- Global nav label: **“Describe a Problem”** or **“New Case”**.
- Dashboard tile: “Describe a problem” should link to this same route.

---

## 2. Left column – form sections & fields

We **keep** the current structure (colony/system, water, recent changes) and extend it.

### 2.1 Colony & system (keep)

Fields (text or select, as appropriate):

- Colony / room name
- Institution / lab
- System type:
  - Recirculating rack / static tanks / flow-through / other
- Approximate number of frogs:
  - Numeric input or free text

These values are attached to the Case and also help the AI phrase advice.

---

### 2.2 Water snapshot (keep but align with husbandry key)

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

> “Need help with RO + buffering? See the ROBUFFER guide.”

This can be a link to the ROBUFFER spec or a static info drawer.

---

### 2.3 Recent changes (keep)

Free-text textarea:

- “Recent changes (last 2–4 weeks)”

Used to capture:

- New water source.
- New salt mix.
- Equipment moves.
- New density.
- New feeding regime.
- Room renovation / changes in staff access.

AI should pay special attention to changes overlapping with onset of problems.

---

### 2.4 Husbandry snapshot (NEW)

Section title: **“Husbandry snapshot (how things look right now)”**.

Add structured fields that map to the **13 Master Key** points:

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

### 2.5 Feeding behavior video (NEW)

Section title: **“Feeding behavior video (optional)”**.

#### 2.5.1 Upload field

- File input:
  - Label: `Upload short feeding clip (30–60 seconds)`
  - Accept: `video/mp4, video/quicktime, video/webm`
- Helper text:
  > “This helps compare your feeding response to internal reference videos. Start recording, add food, and keep filming until frogs either lose interest or food is gone.”

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

Keep a large textarea (if not already present):

- Label: “Describe the problem in your own words”
- This is where the user writes:
  - “Frogs stopped eating after water change”
  - “Redness on legs after moving to new rack”
  - etc.

The AI will use this plus the structured fields to generate the summary.

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
- Has a small header label (e.g., “Situation Summary”) and then bullet/paragraph content.

### 3.1 “Analyze with AI” button

For now, there should be a button:

- Label: `Analyze with AI`
- Behavior:
  - For MVP/stub: could be a no-op or call a dummy endpoint.
  - Long term: will send intake payload to backend AI endpoint and fill these panels with real output.

The UI should be ready for asynchronous updates (loading state, then results).

---

## 4. Data & API expectations

The frontend should package the intake form into a payload along these lines:

```ts
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

interface IntakeFormPayload {
  facilityName?: string;
  institution?: string;
  systemType?: string;
  approxFrogCount?: string;

  waterTempC?: string;
  ph?: string;
  conductivity?: string;
  ammoniaStatus?: "unknown" | "ok" | "elevated";
  waterSource?: "ro" | "city" | "well" | "mixed" | "unknown";

  recentChanges?: string;
  problemDescription?: string;

  husbandrySnapshot?: HusbandrySnapshot;
  feedingVideoMeta?: FeedingVideoMeta;
}
