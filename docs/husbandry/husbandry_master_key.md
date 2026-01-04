# Frog Social – Husbandry Master Key (13-Point Baseline)

This document defines the **core husbandry model** that Frog Social uses for
troubleshooting and assessing Xenopus colony health.

The 13 points below are the **primary lens** for all diagnostics.

- Pathogens are treated as **secondary, opportunistic** factors.
- Healthy colonies are defined primarily by:
  - Water source and buffering.
  - Density and feeding behavior.
  - Environmental stressors (vibration, light, disturbance).
  - Skin condition.

Later, device-based telemetry (feeding behavior + skin shininess metrics)
will plug into this same model.

---

## 0. Telemetry Overview

For each thread/case, we aim to capture a telemetry object that includes
(at least):

- `water_source`: `"RO" | "city" | "well"`
- `buffering_method`: `"none" | "salts_only" | "ROBUFFER" | "mix_city_RO" | "other"`
- `gh`: number | null
- `kh`: number | null
- `ph`: number | null
- `ph_meter_calibrated`: boolean | null
- `temp_c`: number | null
- `density_band`: `"low" | "medium" | "high"`
- `feeding_response`: `"high" | "medium" | "low"`
- `skin_status`: `"shiny" | "dull" | "lesions"`
- `vibration`: `"quiet" | "some_hum" | "loud"`
- `flow_turbulence`: `"gentle" | "splashy"`
- `light_level`: `"low" | "medium" | "high"`
- `disturbance`: `"rare" | "frequent"`
- `shelter_competition`: `"none" | "moderate" | "severe"`
- `recent_changes`: free text summary of major changes in last 1–2 weeks

The backend will use this telemetry to produce a list of **HusbandrySignals**,
each with:

- `id`: short string key (e.g. `"water_source"`)
- `status`: `"ok" | "watch" | "problem" | "unknown"`
- `message`: one-sentence explanation
- `recommendation`: one concrete, prioritized suggestion

These signals drive:
- The AI’s written guidance.
- The checklist & color-coding in the UI.
- Future learning and ranking of risk factors.

---

## 1. Water Source

**What:** RO, treated city water, or well water.  
**Why:** Source determines baseline mineral profile, buffering, and long-term
stability.

**Healthy pattern:**

- Well water or properly treated city water with stable chemistry, **or**
- RO **plus** a robust remineralization/buffering protocol (e.g. ROBUFFER),
  not bare RO alone.

**Problem patterns:**

- Pure RO with no remineralization.
- “RO + salts only” where GH/KH remain very low and unstable.

---

## 2. Buffering & Mineral Profile (GH / KH)

**What:**  
- General hardness (GH; mainly Ca²⁺ and Mg²⁺).  
- Carbonate hardness (KH; bicarbonate/carbonate buffer).

**Why:**  
- GH and KH maintain pH stability and support skin, osmoregulation, and
  reproduction.
- Extremely soft, unbuffered water is fragile and prone to swings.

**Healthy pattern:**

- Moderate GH and KH (not zero, not extreme), e.g.:
  - GH somewhere in a reasonable mid-range (e.g. ~4–10 °dGH).
  - KH ~3–8 °dKH (enough buffering to prevent wild pH drift).
- GH/KH achieved either by:
  - Using suitable well/city water, or
  - RO plus a remineralization protocol (ROBUFFER-type approach).

**Problem patterns:**

- GH ≈ 0 and KH ≈ 0 with RO + “salt mix only.”
- Very high GH/KH from uncontrolled additives.

---

## 3. pH Level and Stability

**What:** Actual pH and whether the instrument is trustworthy.

**Why:**  
- Chronic pH drift or extremes cause stress, redness, appetite changes,
  and can destabilize the microbial environment.
- Miscalibrated meters create phantom problems (chasing fake pH numbers).

**Healthy pattern:**

- pH in a stable band ~7.0–7.6 (facility-specific norms acceptable).
- Minimal drift day-to-day.
- pH meter calibrated with appropriate standards on a regular schedule.

**Problem patterns:**

- pH readings swinging widely without documented interventions.
- Apparent extreme pH with no calibration or cross-check of the meter.
- Chronic low or high pH coupled with dull skin / poor feeding.

---

## 4. Temperature

**What:** Water temperature range and stability.

**Why:**  
- Temperature directly impacts metabolism, immune function, and
  reproductive behavior.

**Healthy pattern:**

- Stable, appropriate temp band for Xenopus (often low 20s °C).
- No rapid spikes or drops.
- Seasonal or experimental deviations are deliberate and monitored.

**Problem patterns:**

- Frequent unexplained temp shifts.
- Temperatures far outside the facility’s established normal band.

---

## 5. Density (Stocking Level)

**What:** Number of frogs per tank volume and shelter.

**Why:**  
- Density strongly shapes feeding behavior, competition, and overall
  activity.
- Too sparse → frogs may not sense food or compete.
- Too dense → chronic fighting, injuries, and uneven access.

**Healthy pattern:**

- Moderate to high densities that:
  - Encourage brisk, competitive feeding.
  - Do not produce chronic injury or visible stress.
- Density tailored to tank size, flow, and shelter configuration.

**Problem patterns:**

- Very low density (e.g. a single frog in a large tank) with poor feeding.
- Overcrowded tanks with frequent lesions and obvious conflict.

---

## 6. Feeding Behavior (Event Quality)

**What:** How frogs respond during a structured 0–10 minute feeding event.

**Why:**  
- One of the strongest **positive health indicators**.
- Integrates appetite, sensory function, and comfort in the environment.

**Healthy pattern:**

- Food introduced in small increments until frogs visibly respond.
- Slightly increased amounts while frogs remain actively feeding
  for ~10 minutes.
- Response matches density: vigorous, coordinated competition for food.

**Reference:**

- Three benchmark videos:
  - Low vigor / low density.
  - Medium vigor / medium density.
  - High vigor / high density.
- User-submitted videos can be compared qualitatively to these.

**Problem patterns:**

- Slow, hesitant interest in food at otherwise reasonable density.
- Food accumulating uneaten.
- Only a minority of frogs participating while others remain withdrawn.

---

## 7. Water Flow & Turbulence (Nozzle Position)

**What:** Flow rate, direction, and turbulence at the water surface.

**Why:**

- Excess turbulence, splashing, or jet-like flows create noise and
  vibration that can stress frogs.
- Insufficient flow can lead to poor water quality.

**Healthy pattern:**

- Gentle, even flow across the tank.
- Nozzle positioned to avoid loud splashing on the surface.
- No obvious “blast zone” frogs constantly avoid.

**Problem patterns:**

- Loud, splashing inflows near frogs’ resting areas.
- Highly directional jets causing avoidance or abnormal swimming.

---

## 8. Vibration / Hum / Ambient Noise

**What:** Background vibration and noise from pumps, blowers, HVAC, etc.

**Why:**

- Frogs are vibration-sensitive. Constant hum or rattling is a major,
  chronic stressor, often underestimated.

**Healthy pattern:**

- Racks and tanks feel mechanically quiet.
- Equipment is secured and decoupled to minimize vibration.
- No constant rattling or high-frequency hum dominating the room.

**Problem patterns:**

- Noticeable vibration on tank edges or lids.
- Audible rattling or equipment hum in quiet periods.

---

## 9. Room Disturbance Frequency

**What:** Human traffic, door slams, frequent handling, and general activity.

**Why:**

- Frequent disturbance compounds stress from other issues
  (light, vibration, etc.).
- Frogs never “settle” if the room is chaotic.

**Healthy pattern:**

- Predictable, limited disturbance.
- Handling clustered and deliberate.
- Quiet periods in the daily cycle.

**Problem patterns:**

- Constant in-and-out traffic near racks.
- Frequent movement of racks or noisy activities in the same room.

---

## 10. Light Intensity & Schedule

**What:** Light intensity and photoperiod.

**Why:**

- Frogs do not like intense light.
- Photoperiod should be stable, not constantly shifting.

**Healthy pattern:**

- Soft, indirect light over tank surfaces.
- Standard 12/12 light cycle (assumed; we do not micromanage this
  unless clearly broken).
- No glaring spotlights or frequent on/off cycling.

**Problem patterns:**

- Bright, direct lighting constantly on racks.
- Erratic light schedules or frequent manual toggling.

---

## 11. Skin Condition

**What:** Shine, texture, presence of lesions or chronic dullness.

**Why:**

- Skin is a visible readout of systemic health, water quality,
  and environmental stress.
- “Shiny frog” is a positive indicator; dull or injured skin is a warning.

**Healthy pattern:**

- Shiny, smooth skin.
- No chronic erythema, ulcers, or patchy sloughing.

**Problem patterns:**

- Chronic dull or gray appearance.
- Frequent lesions, especially on backs/limbs.
- Skin injuries linked to housing, shelter competition, or rough surfaces.

**Note:**  
Later, we aim to introduce **device-based or vision-based scoring** of
skin “shininess” to reduce subjective variation between observers.

---

## 12. Shelter / Space Configuration (PVC Tubes, etc.)

**What:** Type and distribution of shelter; how frogs use it.

**Why:**

- Insufficient or poorly distributed shelter leads to fighting and injuries.
- Shelter behavior interacts with density and feeding access.

**Healthy pattern:**

- Adequate number and distribution of PVC tubes or other shelter.
- Minimal competition or fighting to access shelters.
- Frogs look relaxed in resting positions.

**Problem patterns:**

- Visible fighting or scarring from PVC tube competition.
- Only a few frogs monopolizing all shelter spaces.

---

## 13. Recent Changes / Interventions

**What:** Major changes in water, equipment, density, or diet within the
last 1–2 weeks.

**Why:**

- Many “mystery” problems track directly to a recent system change.
- If we don’t log changes, we miss obvious causal links.

**Healthy pattern:**

- Changes (new pumps, water source shifts, density adjustments, diet)
  introduced deliberately and logged.
- Outcomes observed and fed back into case history.

**Problem patterns:**

- Apparent “sudden” problems after undocumented changes.
- Multiple variables altered at once with no record.

---

## Usage in Frog Social

- This document is the **authoritative reference** for husbandry logic.
- Backend code should implement an `evaluateHusbandry(telemetry)` function
  that:
  - Evaluates each of these 13 points.
  - Returns a set of `HusbandrySignal`s.
- The AI agent:
  - Must **not contradict** these signals.
  - Should explain them in plain language.
  - Should prioritize interventions based on these items before
    jumping to pathogen-focused explanations or tests.
