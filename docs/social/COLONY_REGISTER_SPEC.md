# Colony Register + Management

## Purpose

The Colony Register is a **private**, lightweight management surface for logged-in users to maintain continuity records for their colonies/systems.

It is tightly connected to:
- **Continuity** — maintaining a running record of what happened, when, and why
- **Troubleshooting** — providing immediate system context when problems arise
- **Case Memory** — linking colony history to cases for better pattern recognition
- **System Context** — giving the AI accurate baseline information for recommendations

It is **not**:
- generic vivarium software
- a full LIMS replacement
- an animal tracking database
- a breeding/genetics management tool

---

## Scope Boundaries

Colony Management exists to support Frog Social's core mission: troubleshooting, case memory, and husbandry continuity.

Features are included only if they serve:
1. Better case creation (auto-populated context)
2. Better troubleshooting (history of changes visible at a glance)
3. Better pattern detection (timeline of events correlated with problems)
4. Personal record-keeping that makes the user's life easier

Features are excluded if they:
- Duplicate LIMS/vivarium inventory systems
- Require complex multi-user permissions (beyond owner + authorized group)
- Create administrative burden unrelated to colony health
- Turn Frog Social into facility management software

---

## Access & Privacy

- Colony records are **private to the owner and explicitly invited team members only**.
- No other Frog Social user can view, search, or access a colony unless they are the owner or an authorized member.
- Access is granted only through **gated invitation** by the colony owner.
- Colony identifiers may use coded/pseudonymous names.
- Institutional affiliation is optional and never displayed publicly.
- There is no admin view of colony data. Platform administrators cannot browse individual colony records.

### Colony Code

Every colony gets a unique, shareable **colony code** (e.g., `BRK-7X2M`).

- Auto-generated on colony registration (7 characters, unguessable)
- Displayed prominently on the Colony/System Profile page
- Used to:
  - **Link cases to the colony** — enter the code when filing via Describe a Problem
  - **Join the colony team** — enter the code to self-serve join (no owner approval needed)
- The owner can **regenerate** the code to revoke future joins
- The code is the primary sharing mechanism: "Our colony code is BRK-7X2M"

### Shared Access Model

A colony belongs to a **team**, not just one person. Typical team:
- A **colony tech** who manages day-to-day operations
- A **PI** who oversees the lab
- An **attending vet** who needs visibility

Team members join by:
1. **Colony code** (self-serve) — owner shares the code, member enters it
2. **Username invitation** (owner invites directly)

All authorized users can:
- View the Colony/System Profile (baseline, event log, status, cases)
- Add events and update status
- File cases that link to the colony
- Export the colony record

Only the owner can:
- Delete the colony
- Invite or remove team members
- Regenerate the colony code

### Enforcement

- All API endpoints check: is the caller the owner OR in `authorizedUsers`?
- Unauthorized users receive 403 Access Denied.
- No endpoint returns colonies that the caller doesn't have explicit access to.
- Colony code join is instant (no approval), but the owner can revoke access or regenerate the code.

---

## Core Data Model

### Colony/System Record

Each registered colony/system contains:

```ts
interface ColonyRecord {
  id: string;                    // system-generated unique ID
  userId: string;                // owner
  authorizedUsers?: string[];    // group access

  // Identity
  colonyName: string;            // user-chosen name or code
  systemId?: string;             // optional facility-level ID
  species?: string;              // e.g. "Xenopus laevis", "Xenopus tropicalis"

  // Baseline system context
  systemType?: "recirculating" | "static" | "flow_through" | "dump_fill" | "other";
  waterSource?: "ro" | "city" | "well" | "mixed" | "unknown";
  bufferingApproach?: string;    // free text
  typicalDensity?: string;       // free text or band
  typicalTemp?: string;          // e.g. "18-20°C"
  facilityLocation?: string;     // room, building, etc.
  notes?: string;                // general baseline notes

  // Metadata
  createdAt: string;             // ISO date
  updatedAt: string;             // ISO date

  // Linked data
  eventLog: ColonyEvent[];
  statusHistory: StatusEntry[];
}
```

### Colony Event (Running Event Log)

```ts
interface ColonyEvent {
  id: string;
  date: string;                  // ISO date
  type: EventType;
  description: string;           // free text
  linkedCaseId?: string;         // optional link to a Frog Social case
}

type EventType =
  | "import"          // new animals added
  | "export"          // animals removed
  | "water_change"    // water source or chemistry change
  | "equipment"       // equipment change, maintenance
  | "feeding"         // feeding protocol change
  | "treatment"       // salt, antibiotics, temp shift, etc.
  | "observation"     // notable observation not yet a case
  | "incident"        // deaths, escapes, equipment failure
  | "procedure"       // injections, breeding, sampling
  | "system_change"   // density change, tank move, rack change
  | "note"            // general note
  ;
```

### Status/Recovery Tracking

```ts
interface StatusEntry {
  id: string;
  date: string;
  status: "stable" | "recovering" | "concern" | "active_problem" | "new_setup";
  note?: string;
  linkedCaseId?: string;
}
```

---

## Features (v1 — Lightweight)

### 1. Colony/System Registration

- Add a new colony with a name/code and basic system info.
- Minimal required fields: colony name only. Everything else optional.
- Edit baseline info at any time.

### 2. Baseline System Context

- Water source, system type, buffering, typical density, typical temp.
- This context auto-populates into Describe a Problem when the user selects this colony.
- Reduces repeated data entry.

### 3. Imports / Changes / Notes

- Simple event log: date + type + description.
- Quick-add form: select event type, write 1–2 sentences, save.
- Events display as a chronological timeline.

### 4. Running Event Log

- Displays all events for a colony in reverse-chronological order.
- Filterable by event type.
- Linkable to cases (optional: "Link to case" button on any event).

### 5. Recovery / Status Tracking

- Simple status indicator: stable / recovering / concern / active problem / new setup.
- Updated manually by the user.
- Status changes are logged with date and optional note.
- Visible at a glance on the colony list view.

### 6. Case → Colony Linkage (one-directional)

- A case can reference a colony (user selects "which colony" when creating a case).
- This is **one-directional**: a case points to a colony, not the other way around.
- The colony register does NOT display linked cases. It is not a case tracker.
- Colony management stays a pure continuity/management record.
- If a user wants to see cases related to a colony, they use Case History with the colony context — the colony register itself does not aggregate cases.

### 7. Exportable Local Record

- Export colony record as CSV (v1).
- XLSX export as a future enhancement if feasible.
- Export includes: baseline info + full event log + status history + linked case IDs.
- Export is private to the user (no public sharing).

---

## UI Expectations

### Colony List View

- Shows all user's registered colonies.
- Each entry shows: name, system type, current status indicator, last event date.
- "Add Colony" button.

### Colony Detail View

- Header: colony name, system ID, species, current status badge.
- Tabs or sections:
  - **Baseline** — system context fields (editable)
  - **Event Log** — chronological timeline with quick-add
  - **Status** — current status + history
  - **Export** — download CSV

Note: there is no "Linked Cases" tab. The colony register does not aggregate cases. Link direction is case → colony only.

### Quick-Add Event

- Inline form at top of event log:
  - Date (defaults to today)
  - Event type (dropdown)
  - Description (1–2 line text input)
  - "Add" button
- No page reload — event appears immediately in timeline.

---

## Integration with Frog Social Surfaces

### Describe a Problem (case → colony)

- "Which colony/system?" dropdown pulls from the user's Colony Register.
- Selecting a colony auto-fills baseline context (system type, water source, etc.) into the case.
- The case stores a `colonyId` reference — this is one-directional (case points to colony).
- The colony register does NOT display or list cases. It is not a case aggregator.

### Social Feed

- Users may tag a colony when posting (optional, for their own context).
- This does not create a visible link in the colony register.

### Case History

- AI can reference the user's colony baseline when generating recommendations for their cases.
- The colony register itself remains a standalone management tool.

---

## What This Is NOT

- Not a breeding tracker or genetics database.
- Not a census or animal inventory system.
- Not a regulatory compliance tool.
- Not a multi-facility management platform.
- Not a replacement for institutional LIMS.

Colony Management exists to serve **one user's continuity, troubleshooting, and case context** — keeping the information they need to understand what happened, when, and why, so that when a problem arises they have immediate access to their system's history.

---

## Non-Negotiables

1. Private by default — only owner and authorized group see records.
2. Minimum-entry friendly — colony name is the only required field.
3. Tightly coupled to troubleshooting and case memory.
4. Does not expand into generic vivarium/LIMS territory.
5. Events are simple: date + type + description.
6. Export is always available to the user.
7. Colony context auto-populates into case intake forms.
8. **Link direction is case → colony, never colony → case.** A case can reference a colony. The colony register does not display or aggregate cases. It is not a case tracker.
