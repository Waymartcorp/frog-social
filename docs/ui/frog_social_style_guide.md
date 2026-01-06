
---

## 4️⃣ `docs/ui/frog_social_style_guide.md`

```md
# Frog Social – UI Style Guide

Goal: The app should feel like a **modern lab console** crossed with a **calm chat hub**.
Young postdocs, veterinarians, and PIs should feel like:
- “This is a serious tool.”
- “This is nicer than most institutional software.”
- “I actually enjoy hanging out here.”

This guide defines the visual system (colors, typography, spacing, components) for the Frog Social app.

---

## 1. Brand adjectives

- Calm, precise, trustworthy
- Slightly playful / insider, not corporate
- “Field notes + control room” rather than generic dashboard

---

## 2. Color palette

Base colors:

- **App shell background**: `#050810` (very dark blue-black)
- **App body background**: `#0B1020`
- **Card background**: `#111827` (dark slate)
- **Card border**: `#1F2937`
- **Primary text**: `#F9FAFB`
- **Secondary text**: `#9CA3AF`

Accent colors (Xenopus / water theme):

- **Primary accent (frog-green)**: `#34D399`
- **Secondary accent (cyan)**: `#38BDF8`
- **Warning (trend bad)**: `#F97316`
- **Danger (escalation)**: `#EF4444`

Usage:

- Primary CTA buttons (e.g., “Describe a problem”, “Post message”) → frog-green.
- Links and subtle highlights → cyan.
- Avoid pure white backgrounds; use dark surfaces and soft gradients instead.

---

## 3. Typography

Base:

- Font: system sans (Inter, system UI, -apple-system, BlinkMacSystemFont, "Segoe UI").
- Body text:
  - `text-sm md:text-base text-gray-300`
- Headings:
  - H1 (page title): `text-2xl md:text-3xl font-semibold`
  - H2 (card / section title): `text-lg font-semibold text-gray-50`
  - H3/minor headings: `text-sm font-semibold text-gray-300`

Meta / technical values:

- Use monospaced for: pH, temp, conductivity, density codes.
  - `font-mono text-xs text-gray-400`

---

## 4. Layout & spacing

Global layout:

- Max width: `max-w-6xl` or ~1200–1280px, centered.
- Global padding:
  - `px-4 md:px-8 py-6`

Cards:

- Card container:
  - `bg-slate-900/70 backdrop-blur border border-white/5 rounded-2xl shadow-lg shadow-black/40`
  - Inner padding: `p-4 md:p-6`
- Spacing between cards/columns:
  - `gap-4 md:gap-6`

Page structure:

- Most pages use:
  - A top area for title and optional filters/action buttons.
  - Below that, a grid or flex layout with cards.

---

## 5. Navigation bar

The top navigation bar appears on **all authenticated pages**.

Nav container:

- Classes:
  - `bg-slate-950/80 backdrop-blur border-b border-white/5`
  - `px-4 md:px-8 py-3`
  - `flex items-center justify-between`

Brand:

- Left side:
  - Small frog icon or logo (can be placeholder text “🐸”).
  - “Frog Social” text:
    - `text-sm md:text-base font-semibold text-gray-100`

Nav items (center or left):

- Layout:
  - `flex items-center gap-2 md:gap-3`
- Default nav item:
  - `text-sm text-gray-300 px-3 py-2 rounded-full hover:bg-white/5 hover:text-gray-50 transition`
- Active nav item:
  - `text-emerald-300 bg-emerald-500/10 border border-emerald-500/40`

Examples:

- Home / Dashboard
- Describe a Problem
- Case History
- Social
- Systems
- LabWorks
- Profile

Sign out:

- Far right:
  - `bg-slate-800 hover:bg-slate-700 text-gray-100 rounded-full px-3 py-1.5 border border-white/10 text-sm`

---

## 6. Buttons & interactive elements

### Primary button

Use for main actions (e.g., “Describe a problem”, “Submit case”, “Post message”):

- `bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium rounded-full px-4 py-2 shadow shadow-emerald-500/30 transition-transform duration-150 hover:scale-[1.02]`

### Secondary button

Use for secondary actions (e.g., “Cancel”, “View history”):

- `bg-slate-800 hover:bg-slate-700 text-gray-100 rounded-full px-4 py-2 border border-white/10 text-sm`

### Icon buttons

For smaller actions (filter, refresh, etc.):

- `rounded-full p-2 bg-slate-800/80 hover:bg-slate-700 border border-white/10`

---

## 7. Inputs, textareas, selects

General style (base class):

- `bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-500`
- `focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60 outline-none transition`

Textareas:

- Same as input, plus:
  - `min-h-[120px]`
  - `resize-vertical`

Selects:

- Same base styles as inputs, with:
  - `pr-8` to accommodate dropdown arrow.
- For multi-select chips, use:
  - `inline-flex items-center gap-1 rounded-full bg-slate-800 border border-white/10 px-2 py-0.5 text-xs text-gray-200`

Error states:

- Border color: `border-red-500/70`
- Helper text: `text-xs text-red-400 mt-1`

---

## 8. Dashboard cards

Dashboard tiles are key entry points (Describe a Problem, Review Past Cases, Social, Systems, LabWorks, Profile).

Card container:

- `bg-slate-900/70 border border-white/5 rounded-2xl p-4 md:p-5 hover:border-emerald-500/40 hover:shadow-emerald-500/20 hover:-translate-y-[1px] transition`

Card content:

- Tag (above title):
  - `text-[10px] uppercase tracking-wide bg-emerald-500/15 text-emerald-300 rounded-full px-2 py-0.5`
- Title:
  - `text-lg font-semibold text-gray-50 mt-2`
- Body text:
  - `text-sm text-gray-300 mt-1.5`
- Footer link/button:
  - `text-sm font-medium text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-1 mt-4`

---

## 9. Social feed styling

Layout:

- Two-column layout on desktop:
  - Left: feed (`basis-2/3`).
  - Right: AI assistant panel (`basis-1/3`).
  - On mobile, stack vertically (`flex-col`).

Feed container:

- Left column card:
  - `bg-slate-900/70 border border-white/5 rounded-2xl p-4 md:p-5`

Message bubble:

- Container:
  - `rounded-2xl bg-slate-800/80 border border-white/5 px-3 py-2 mb-2`
- Header (author + timestamp):
  - `flex items-baseline justify-between`
  - Author: `text-xs font-medium text-gray-200`
  - Timestamp: `text-[11px] text-gray-500`
- Content:
  - `text-sm text-gray-100 mt-1`
- Optional tags:
  - `inline-flex items-center gap-1 rounded-full bg-slate-900/80 text-gray-300 text-[11px] px-2 py-0.5 mt-1`

AI messages:

- Container:
  - `bg-slate-900 border border-emerald-500/40 rounded-2xl px-3 py-2 mb-2`
- Husbandry chips:
  - `inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-200 text-[11px] px-2 py-0.5`

AI assistant panel (right column):

- Card:
  - `bg-slate-900/80 border border-white/10 rounded-2xl p-4 md:p-5`
- Section headings:
  - `text-xs font-semibold uppercase tracking-wide text-gray-400`
- Body:
  - `text-sm text-gray-100 mt-1`

---

## 10. Intake summary & case panels

Panels like “Situation summary”, “Husbandry focus areas”, “Next steps”, “When to escalate”:

- Container:
  - `bg-slate-900/80 border border-white/10 rounded-2xl p-4 mb-3`
- Heading:
  - `text-xs uppercase tracking-wide font-semibold text-gray-400`
- Body:
  - Paragraphs: `text-sm text-gray-100 mt-1`
  - Lists: `list-disc list-inside text-sm text-gray-200`

---

## 11. Motion & animation

Keep animations subtle and professional:

- Cards:
  - `hover:-translate-y-[1px] hover:shadow-lg hover:shadow-black/40`
- Buttons:
  - `transition-transform duration-150`
  - `hover:scale-[1.02]`
- Page content:
  - Optional small fade/slide on mount is acceptable (200–250ms).

No flashy full-screen animations or distracting effects.

---

## 12. Icons & empty states

Icons:

- Use an icon set like Lucide for:
  - Cases, Social, Systems, LabWorks, Profile.
- Keep icons small and minimal (`w-4 h-4`), used next to labels.

Empty states:

- Use simple illustrations or icons with short copy, e.g.:
  - “No cases yet — use ‘Describe a problem’ to start your first case.”
- Keep empty state cards consistent with other card styling.

---

## 13. Implementation notes

- Prefer shared components:
  - `Card`, `Button`, `Input`, `Textarea`, `Select`, `NavBar`, etc.
- When adjusting layouts/components, use Tailwind utility classes consistent with this guide.
- Avoid scattered inline styles that break the visual system.
- Do **not** change routing or functional behavior solely due to styling, unless requested by a separate docs file (e.g., navigation spec).

This style guide should be read by the AI (Cursor) and used as the visual reference when refactoring existing components and pages.
