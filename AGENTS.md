# AGENTS.md

## Frog Social source of truth

For Frog Social behavior, learning model, case logic, retention rules, knowledge hierarchy, and system memory design, use:

- `docs/FROG_SOCIAL_INFORMATION_ECOSYSTEM.md`

For husbandry doctrine, environmental weighting, and husbandry-first guidance, use:

- `docs/HUSBANDRY_FRAMEWORK.md`

For terms, privacy, and content-use protection, use:

- `docs/TERMS_AND_PRIVACY.md`

For supporting implementation specs, use:

- `docs/social/DESCRIBE_A_PROBLEM_SPEC.md`
- `docs/social/COLONY_REGISTER_SPEC.md`
- `docs/social/FROG_SOCIAL_AI_INTAKE_TEMPLATE.md`
- `docs/social/SOCIAL_SURFACES_REFERENCE.md`
- `docs/ui/frog_social_style_guide.md`

If older Frog Social notes conflict with the source-of-truth files above, the source-of-truth files win.

---

## Production truth

Canonical production environments:

- `https://www.frogsocial.org`
- `https://frog-social.vercel.app`

Production is the truth environment.

Do not treat localhost behavior as proof of production behavior.

Localhost may be used only for explicitly labeled local debugging.

---

## Agent behavior rules

1. Inspect relevant files first.
2. State which files were inspected.
3. State which files will be changed.
4. Do not hallucinate records, case IDs, saved state, summaries, stored links, or connectivity.
5. Do not claim behavior works unless directly tested.
6. Clearly separate:
   - VERIFIED
   - UNVERIFIED
   - BROKEN / STILL WRONG
   - ASSUMPTIONS
7. Preserve product semantics over superficial completion.
8. Do not let formatting-only work silently alter persistence or case logic.
9. Do not let the LLM override code-enforced retention rules.
10. If a behavior is only verified locally, label it `LOCAL-ONLY`.

---

## Scope discipline

### Formatting-only tasks
Allowed:
- layout
- hierarchy
- labels
- rendering structure
- concise wording
- visual clarity

Not allowed unless explicitly requested:
- schema changes
- persistence changes
- backend route changes
- case logic changes
- LLM logic changes

### Persistence / logic tasks
Allowed:
- inspect data flow
- trace reads and writes
- test reload behavior
- fix clearly identified broken save/read paths if requested
- align case creation/update behavior if requested

Must preserve:
- chat can create a case
- chat is not the archived case
- Describe a Problem can create a case
- Case History stores formal cases only

---

## Documentation hierarchy

Use this hierarchy when implementing Frog Social:

1. `docs/FROG_SOCIAL_INFORMATION_ECOSYSTEM.md`
2. `docs/HUSBANDRY_FRAMEWORK.md`
3. supporting spec files in `docs/social/` and `docs/ui/`
4. `docs/NEXT_STEPS.md` for operational backlog only
5. `docs/00_HUB.md` for orientation only

`NEXT_STEPS.md` and `00_HUB.md` are not the main behavior-definition files.

Do not infer Frog Social behavior from scattered historical prompts if the source-of-truth files are explicit.

Do not reintroduce deprecated behavior from old notes.

---

## Required reporting format

For every non-trivial Frog Social task, return exactly:

- Files inspected
- Files changed
- What changed
- Direct tests run
- VERIFIED
- UNVERIFIED
- BROKEN / STILL WRONG
- ASSUMPTIONS
- Next recommended step