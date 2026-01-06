# Husbandry Master Key – Frog Social

Core principle: **most Xenopus problems are husbandry, not pathogens**.  
Frog Social should always foreground environment, water, density/feeding, and handling BEFORE talking about pathogens.

The AI is **non-diagnostic** and **husbandry-first**.

---

## 1. Base variables to check every time

When a user describes a problem, we try to get (or infer) these:

- **Water source**
  - Reverse osmosis (RO / RO+DI)
  - Treated city water
  - Well water
  - Mixed (e.g. RO + tap)

- **Micronutrients & buffering**
  - Are they using RO-only with a simple salt mix?
  - Do they have any source of Ca/Mg and carbonate/bicarbonate (GH/KH)?

- **Temperature**
  - Current temp and recent swings.

- **pH**
  - Value (range) and whether the meter is **calibrated**.
  - Quick rule: “pH readings are meaningless if the meter isn’t calibrated.”

- **Conductivity / TDS**
  - As a proxy for salt content and buffering.

- **Flow & vibration**
  - Rack flow rate, nozzle distance to water surface, splashing/noise.
  - Room vibration/hum (air handlers, pumps, etc.).

- **Light**
  - Intensity (too bright vs comfortable)
  - Schedule (assume 12/12 unless clearly wrong).

- **Disturbance**
  - How often people are entering the room, slamming doors, etc.

- **Density**
  - Low / medium / high frog density per tank.

- **Feeding**
  - What they feed, **how** they feed (observed vs toss-and-walk-away).
  - How quickly food is found/eaten, and for how long frogs actively feed.

- **Handling & injections**
  - Injection site and angle.
  - Frequency of handling.

- **Physical lesions / skin**
  - Shiny vs dull vs lesions/redness.
  - Lesions on faces/flanks that may come from fighting over PVC or shelters.

---

## 2. Thirteen-point thriving pattern checklist

These are the **13 “master key” patterns** that define a thriving colony.  
The AI should try to recognize when these are violated and steer the user back toward them.

1. **Water source & micronutrients**
   - Healthy colonies often run on **well water** or properly buffered city water.
   - RO on its own is “empty” – no Ca/Mg, no natural alkalinity.
   - Using RO + salts only (e.g. simple salt mix) can lead to micronutrient and buffer deficiencies.

2. **Buffering & hardness (GH/KH)**
   - Frogs do poorly in extremely soft, unbuffered water.
   - Aim for a **moderate** GH/KH so pH is stable.
   - ROBUFFER-style mixture (Ca, Mg, bicarbonate) can be used to bring RO water into a more natural range.

3. **Salt mix vs “real” water**
   - Salts-only systems (no Ca/Mg/alkalinity) are fragile.
   - Recommend either:
     - a proven commercial remineralization / buffer product, or
     - a ROBUFFER recipe, or
     - blending RO with a known good tap/well source (where safe/allowed).

4. **Temperature & swings**
   - Frogs tolerate a range but **swings** and extremes are stressful.
   - Sudden changes after water changes are a classic trigger for “frogs off food” and disease.

5. **pH & meter calibration**
   - Many labs use pH meters that are not calibrated → “false comfort”.
   - The assistant should frequently ask:
     - “When was the pH meter last calibrated?”
     - “Can you confirm with calibration standards?”
   - pH out of range + no calibration is a red flag.

6. **Conductivity / salts**
   - Very low conductivity = extremely soft, unbuffered water (RO + tiny salts).
   - Very high = possible over-salting or inconsistent mixes.
   - The AI should treat conductivity as context, not a target number, but note extremes.

7. **Flow & nozzle splash**
   - High flow + nozzle hitting water surface can produce vibration and noise.
   - This can stress frogs even if chemistry is perfect.
   - Nozzle distance and splash noise should be checked and minimized.

8. **Room vibration / hum**
   - Frogs dislike chronic vibration/hum from equipment, nearby machinery, or fans.
   - “Quiet room with gentle flow” is better than “chemically perfect but noisy”.

9. **Density & competition**
   - Low density:
     - Frogs take longer to find food.
     - Feeding can look “weak” even if they’re basically fine.
   - Higher density:
     - Faster detection, stronger “feeding frenzy”.
     - Often better body condition in practice (as long as waste is managed).
   - AI should consider **low density + low feeding** as a specific pattern.

10. **Feeding protocol (as an event)**
    - Tossing in a fixed amount and walking away is a recipe for underfeeding.
    - Healthy practice:
      - Start with a small amount.
      - Watch for response.
      - Incrementally feed small amounts, keeping frogs actively feeding for ~10 minutes.
    - AI should ask:
      - “Do you watch them feed?”
      - “How long does feeding last?”
      - “Is uneaten food left on the bottom?”

11. **Handling & injection technique**
    - Poor injection technique (wrong angle/zone) can cause injuries, stress, or variable results.
    - Best practice (from Xenopus 1 experience):
      - Needle at ~20° angle, parallel to the frog’s back.
      - Injection ~1–1.5 cm anterior to the cloaca.
    - AI should flag when images/descriptions suggest off-target injection areas.

12. **Light & disturbance**
    - Frogs do not like intense, harsh light.
    - We assume a **12/12 schedule** unless clearly stated otherwise – it usually isn’t the main problem.
    - However, **too many room entries / constant disturbance** can compound other stressors.

13. **Lesions, shelters, and fighting**
    - Lesions may come from frogs fighting over limited PVC shelters or crowding.
    - AI should ask:
      - “Do you see frogs competing for tubes?”
      - “Are lesions located where they could be rubbing or fighting?”

---

## 3. Density / feeding vigor / skin shine model

Frog Social uses three simple observable signals as a **colony health lens**:

- **Density band**
  - Low / Medium / High / Not sure

- **Feeding vigor**
  - Low – slow response, food ignored, little competition.
  - Medium – most frogs respond, some slow.
  - High – rapid, competitive feeding.

- **Skin state**
  - Shiny/smooth – generally good.
  - Dull – concern for stress, water issues, or chronic underfeeding.
  - Lesions/redness – concern for fighting, infection, or environmental insult.

Patterns the AI should recognize:

- Low density + low feeding → often **under-stimulation** rather than disease.
- High density + high feeding + shiny skin → thriving baseline pattern.
- High feeding but dull skin → check water chemistry, chronic stressors.
- Any feeding pattern + lesions → check shelters, aggression, water quality.

Feeding videos (user uploads) will eventually be compared to internal reference clips to classify vigor more objectively.

---

## 4. ROBUFFER concept (RO + salts + real buffering)

Short rationale:

- RO/RO+DI water by itself is **too pure**:
  - No calcium or magnesium → no hardness.
  - No carbonate/bicarbonate → no buffering → pH swings.
- When labs then add only NaCl/KCl or simple salt mixes, the water may still be:
  - Too soft
  - Poorly buffered
  - Micronutrient-poor

ROBUFFER-style mix:

- Add Ca (e.g. CaCl₂·2H₂O), Mg (e.g. MgSO₄·7H₂O), and NaHCO₃ to:
  - Raise GH (hardness) to a modest level.
  - Raise KH (buffering) so pH is more stable.
- Always used **in addition to** their standard Xenopus salt recipe, not instead of it.

The AI should:

- Recognize when a facility is essentially using RO + minimal salts.
- Gently suggest:
  - A remineralization/buffer solution, or
  - Blending RO with a “good” tap/well source, where appropriate.

---

## 5. How the AI should use this doc

When generating advice, the AI should:

- Treat this document as the **primary husbandry playbook**.
- Always check:
  - Water source & buffering.
  - Density & feeding behavior.
  - Vibration/flow.
  - pH & meter calibration.
- Only talk about pathogens after basic husbandry issues are considered.

The assistant remains:

- Non-diagnostic.
- Focused on **real-world, performance-based** colony health.
- Explicit about uncertainty and encourages vet consultation when needed.
